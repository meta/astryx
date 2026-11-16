// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Every relative import of a package's shipped modules must name a file the
 * package ships, resolved as an app's bundler resolves it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {filesOnDisk, shippedImportFindings} from './shipped-imports.mjs';
import {validateLoadedIntegrationListed} from './validate-contributions.mjs';
import {validateIntegration} from '../../api/integration/validate-integration.mjs';
import {integrationCheck} from '../../api/integration/check/check.mjs';

const RELATIVE_IMPORT_NOT_SHIPPED = 'relative_import_not_shipped';

/**
 * validate's notes for an unshipped import.
 * @param {{data: {notes?: Array<{code: string, message: string, next?: boolean}>}}} result
 */
const unshippedNotes = result =>
  (result.data.notes ?? []).filter(
    note => note.code === RELATIVE_IMPORT_NOT_SHIPPED,
  );

/** @type {string} */
let dir;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-shipped-imports-'));
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} root @param {Record<string, string>} files */
function write(root, files) {
  for (const [rel, text] of Object.entries(files)) {
    const file = path.join(root, rel);
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
  }
}

/**
 * A package whose entry is `index.js`, with `files` beside it.
 * @param {string} root
 * @param {Record<string, string>} files
 * @param {Record<string, unknown>} [pkg]
 */
function packageAt(root, files, pkg = {}) {
  write(root, {
    'package.json': JSON.stringify({
      name: '@acme/kit',
      version: '1.0.0',
      type: 'module',
      exports: {'.': './index.js'},
      ...pkg,
    }),
    ...files,
  });
}

/** @param {string} root */
const issuesOn = root =>
  shippedImportFindings(root, {files: filesOnDisk(root)}).findings;

describe('shippedImportFindings', () => {
  it('reports a relative import the package does not contain, naming the file and the import', () => {
    packageAt(dir, {
      'index.js': "export {Button} from './button.js';\n",
      'button.js':
        "import {Check} from './icons';\nexport const Button = Check;\n",
    });

    expect(issuesOn(dir)).toEqual([
      {
        code: RELATIVE_IMPORT_NOT_SHIPPED,
        file: 'button.js',
        line: 1,
        message: expect.stringContaining(
          'button.js:1: imports "./icons", which is not a file in the package',
        ),
      },
    ]);
  });

  it('resolves a folder import to its index file, as a bundler does', () => {
    packageAt(dir, {
      'index.js': "export * from './icons';\nexport * from './data.json';\n",
      'icons/index.js': 'export const Check = 1;\n',
      'data.json': '{}\n',
    });

    expect(issuesOn(dir)).toEqual([]);
  });

  it('resolves extensionless and TypeScript imports with the extensions a bundler tries', () => {
    packageAt(
      dir,
      {
        'src/index.ts': [
          "import {a} from './a';",
          "import {b} from './b.js';",
          "import {c} from './c';",
          "const d = await import('./d');",
          "const e = require('./e');",
          'export {a, b, c, d, e};',
          '',
        ].join('\n'),
        'src/a.tsx': 'export const a = <div />;\n',
        'src/b.ts': 'export const b = 1;\n',
        'src/c/index.mjs': 'export const c = 1;\n',
        'src/d.jsx': 'export const d = 1;\n',
        'src/e.cjs': 'module.exports = 1;\n',
      },
      {exports: {'.': {types: './src/index.d.ts', import: './src/index.ts'}}},
    );

    expect(issuesOn(dir)).toEqual([]);
  });

  it('skips type-only imports and re-exports, which a bundler drops', () => {
    packageAt(dir, {
      'index.ts': [
        "import type {Props} from './props';",
        "import {type Size} from './size';",
        "export type {Tone} from './tone';",
        'export const x: Props | Size = 1;',
        '',
      ].join('\n'),
    });

    expect(issuesOn(dir)).toEqual([]);
  });

  it('follows the graph only from what the package exports', () => {
    packageAt(dir, {
      'index.js': 'export const a = 1;\n',
      // Never imported by an entry: a bundler never reads it.
      'scripts/build.js': "import './missing.js';\n",
    });

    expect(issuesOn(dir)).toEqual([]);
  });

  it('reports a stylesheet @import and url() that name no file of the package', () => {
    packageAt(
      dir,
      {
        'index.js': "import './theme.css';\n",
        'theme.css': [
          "@import './base.css';",
          "@import url('./tokens.css');",
          '@font-face { font-family: X; src: url(./fonts/x.woff2?v=1) format("woff2"); }',
          '.a { background: url("data:image/png;base64,AA"), url(#grad), url(https://example.com/a.png); }',
          '',
        ].join('\n'),
        'tokens.css': ':root { --a: 1; }\n',
      },
      {exports: {'.': './index.js', './theme.css': './theme.css'}},
    );

    const issues = issuesOn(dir);

    expect(issues.map(issue => [issue.file, issue.line])).toEqual([
      ['theme.css', 1],
      ['theme.css', 3],
    ]);
    expect(issues[0].message).toContain('imports "./base.css"');
    expect(issues[1].message).toContain('imports "./fonts/x.woff2?v=1"');
  });

  it('follows a bare stylesheet @import that names a shipped file, and never reports one that does not', () => {
    packageAt(
      dir,
      {
        'theme.css':
          "@import 'faces.css';\n@import 'some-package/fonts.css';\n",
        'faces.css': '@font-face { font-family: X; src: url(x.woff2); }\n',
      },
      {exports: {'./theme.css': './theme.css'}},
    );

    expect(issuesOn(dir).map(issue => [issue.file, issue.message])).toEqual([
      ['faces.css', expect.stringContaining('imports "x.woff2"')],
    ]);
  });

  it('reports a relative import that leaves the package', () => {
    packageAt(dir, {'index.js': "import '../shared/util.js';\n"});

    expect(issuesOn(dir)[0].message).toContain('which is outside the package');
  });

  it('fills an exports wildcard from the shipped files', () => {
    packageAt(
      dir,
      {
        'dist/themes/ocean.js': "import './ocean-icons';\n",
        'dist/themes/reef.js': 'export const reef = 1;\n',
      },
      {exports: {'./themes/*': './dist/themes/*.js'}},
    );

    expect(issuesOn(dir).map(issue => issue.file)).toEqual([
      'dist/themes/ocean.js',
    ]);
  });
});

describe('an installed package', () => {
  it('is never walked by the contribution checks everyday commands run', async () => {
    const packageDir = path.join(dir, 'node_modules/@acme/kit');
    packageAt(packageDir, {
      'astryx.integration.mjs': 'export default {};\n',
      'index.js': "export * from './icons';\n",
    });
    const loaded = {
      name: '@acme/kit',
      __packageDir: packageDir,
      __manifestFile: path.join(packageDir, 'astryx.integration.mjs'),
    };

    const {issues, listed} = await validateLoadedIntegrationListed(loaded);

    expect(
      [...issues, ...listed].filter(
        issue => issue.code === RELATIVE_IMPORT_NOT_SHIPPED,
      ),
    ).toEqual([]);
  });

  it('is one `next` note from doctor integration validate', async () => {
    write(dir, {'package.json': JSON.stringify({name: 'app', private: true})});
    const packageDir = path.join(dir, 'node_modules/@acme/kit');
    packageAt(packageDir, {
      'astryx.integration.mjs': 'export default {};\n',
      'index.js': "export * from './icons';\n",
    });

    const result = await validateIntegration('@acme/kit', {cwd: dir});

    expect(unshippedNotes(result)).toEqual([
      {
        code: RELATIVE_IMPORT_NOT_SHIPPED,
        message: expect.stringContaining('index.js:1: imports "./icons"'),
        next: true,
      },
    ]);
    expect(
      result.data.issues.filter(
        issue => issue.code === RELATIVE_IMPORT_NOT_SHIPPED,
      ),
    ).toEqual([]);
  }, 30_000);
});

describe('integration check on a package folder', () => {
  it('notes a file npm leaves out of the package, though it is on disk, and fails only --strict --next', async () => {
    packageAt(
      dir,
      {
        'astryx.integration.mjs': 'export default {};\n',
        'dist/index.js': "export * from './icons';\n",
        'dist/icons/index.js': 'export const Check = 1;\n',
      },
      {
        exports: {'.': './dist/index.js'},
        files: ['dist/index.js', 'astryx.integration.mjs'],
      },
    );

    const strict = await integrationCheck({cwd: dir, strict: true});

    expect(strict.data.failed).toBe(false);
    expect(strict.data.upcoming).toBe(1);
    expect(unshippedNotes(strict.data.checks[0].response)).toEqual([
      {
        code: RELATIVE_IMPORT_NOT_SHIPPED,
        message: expect.stringContaining(
          'dist/index.js:1: imports "./icons", which names dist/icons/index.js, a file npm leaves out of the package',
        ),
        next: true,
      },
    ]);
    const next = await integrationCheck({cwd: dir, strict: true, next: true});
    expect(next.data.failed).toBe(true);
    expect(next.data.failures.map(failure => failure.code)).toContain(
      RELATIVE_IMPORT_NOT_SHIPPED,
    );
  }, 60_000);

  it('notes nothing once npm packs the folder index the import names', async () => {
    packageAt(
      dir,
      {
        'astryx.integration.mjs': 'export default {};\n',
        'dist/index.ts':
          "import type {X} from './types';\nexport * from './icons';\nexport type {X};\n",
        'dist/icons/index.js': 'export const Check = 1;\n',
      },
      {
        exports: {'.': './dist/index.ts'},
        files: ['dist', 'astryx.integration.mjs'],
      },
    );

    const result = await validateIntegration(undefined, {cwd: dir});

    expect(unshippedNotes(result)).toEqual([]);
  }, 60_000);
});
