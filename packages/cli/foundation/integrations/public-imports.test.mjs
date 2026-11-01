// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Source-level public-import checks run by
 * `astryx doctor integration validate` (and so `integration check --strict`).
 *
 * Each test stands up a small integration package under the repo root (so the
 * repo's own Core is the installed Core) and validates it.
 */

import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {
  validateIntegration,
  validateLocalIntegration,
} from '../../api/integration/validate-integration.mjs';
import {readImports} from './public-imports.mjs';
import {subpathDeclaration} from './exports-subpaths.mjs';
import {
  integrationAddComponent,
  integrationAddTemplate,
} from '../../api/integration/add-contribution.mjs';
import {
  integrationCheck,
  strictIssues,
} from '../../api/integration/check/check.mjs';
import {CLI_ROOT} from '../fs/paths.mjs';

const CODES = new Set([
  'component_import_not_exported',
  'component_import_other_package',
  'component_import_missing_name',
  'example_import_not_exported',
  'example_import_missing_name',
  'template_import_not_exported',
  'template_import_outside_root',
  'template_private_import',
  'template_import_missing_name',
  'template_no_default_export',
]);

let dir;

/** @param {string} file @param {string} text */
function write(file, text) {
  fs.mkdirSync(path.dirname(path.join(dir, file)), {recursive: true});
  fs.writeFileSync(path.join(dir, file), text);
}

/** @param {(pkg: any) => void} edit */
function pkg(edit) {
  const file = path.join(dir, 'package.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf-8'));
  edit(value);
  fs.writeFileSync(file, JSON.stringify(value, null, 2));
}

const DOC = (
  importPath = '@acme/widgets/components/AcmeWidget',
  example = 'import {AcmeWidget} from \'@acme/widgets/components/AcmeWidget\';\\n\\n<AcmeWidget label=\\"Save\\" />',
) =>
  `export default {
  type: 'component',
  name: 'AcmeWidget',
  displayName: 'Acme Widget',
  import: '${importPath}',
  usage: {description: 'A pressable widget.'},
  props: [{name: 'label', type: 'string', description: 'Text.', required: true}],
  examples: [{label: 'Basic', code: "${example}"}],
};
`;

const BLOCK = () =>
  `export default {
  type: 'block',
  name: 'account-card',
  displayName: 'Account Card',
  description: 'Account Card template.',
  aspectRatio: 1,
};
`;

beforeEach(() => {
  dir = fs.mkdtempSync(path.join(process.cwd(), '.astryx-public-imports-'));
  // The fixture is a package with its own TypeScript config, scoped to its
  // own files. Without one, the prop check reads the repository's root
  // config, as `tsc` would for a folder inside it, and compiles every
  // declaration in the repository for each check.
  fs.writeFileSync(
    path.join(dir, 'tsconfig.json'),
    `${JSON.stringify({extends: '../tsconfig.json', include: ['**/*']})}\n`,
  );
  write(
    'package.json',
    JSON.stringify({
      name: '@acme/widgets',
      version: '1.0.0',
      type: 'module',
      peerDependencies: {
        '@astryxdesign/core': '>=0.1.0',
        '@astryxdesign/cli': '>=0.1.0',
      },
      exports: {
        './components/AcmeWidget': './components/AcmeWidget.tsx',
        './templates/account-card': './templates/account-card.tsx',
      },
    }),
  );
  write(
    'astryx.integration.mjs',
    "export default {components: './components', templates: './templates'};\n",
  );
  write('components/AcmeWidget.doc.mjs', DOC());
  write(
    'components/AcmeWidget.tsx',
    'export type AcmeWidgetProps = {label: string};\nexport function AcmeWidget({label}: AcmeWidgetProps) {\n  return <button>{label}</button>;\n}\n',
  );
  write('templates/account-card.doc.mjs', BLOCK());
  write(
    'templates/account-card.tsx',
    'import {AcmeWidget} from \'@acme/widgets/components/AcmeWidget\';\nexport default function AccountCard() {\n  return <AcmeWidget label="Account" />;\n}\n',
  );
});

afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** The public-import findings, listed as notes on validate's result. */
async function found() {
  const result = await validateLocalIntegration(dir);
  return (result.notes ?? []).filter(note => CODES.has(note.code));
}

async function codes() {
  return (await found()).map(issue => issue.code).sort();
}

describe('public imports: clean packages', () => {
  it('passes the known-good package', async () => {
    const result = await validateLocalIntegration(dir);
    expect(result.issues).toEqual([]);
  });

  it('passes a condition object with import (types first) or default', async () => {
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {
        types: './components/AcmeWidget.tsx',
        import: './components/AcmeWidget.tsx',
      };
    });
    expect(await codes()).toEqual([]);
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {
        default: './components/AcmeWidget.tsx',
        import: './missing.js',
      };
    });
    expect(await codes()).toEqual([]);
  });

  it('passes a wildcard that covers the component', async () => {
    pkg(p => {
      delete p.exports['./components/AcmeWidget'];
      p.exports['./components/*'] = './components/*.tsx';
    });
    expect(await codes()).toEqual([]);
  });

  it('checks a package whose name is not a bare package name as nameless', async () => {
    pkg(p => {
      p.name = 'acme/kit';
    });
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(result.data.publicImports?.unchecked).toContainEqual(
      expect.objectContaining({
        file: 'package.json',
        reason: expect.stringContaining(
          '"acme/kit" is not a bare package name',
        ),
      }),
    );
  });

  it('reads "exports": null as no exports field', async () => {
    pkg(p => {
      p.exports = null;
    });
    // A doc module loads once per run, so the doc is written before checking.
    write(
      'components/AcmeWidget.doc.mjs',
      DOC('@acme/widgets/components/Missing'),
    );
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain(
      'no file exists at "./components/Missing"',
    );
    // The template's deep path to its own file still resolves.
    expect((await found()).filter(i => i.code.startsWith('template_'))).toEqual(
      [],
    );
  });

  it('keeps legacy deep paths when package.json has no exports', async () => {
    pkg(p => delete p.exports);
    expect(await codes()).toEqual([]);
  });

  it('flags a deep path with no file when package.json has no exports', async () => {
    pkg(p => delete p.exports);
    write(
      'components/AcmeWidget.doc.mjs',
      DOC('@acme/widgets/components/Missing'),
    );
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain(
      'no file exists at "./components/Missing"',
    );
  });

  it('lists a deep path into build output not built yet as not checked', async () => {
    pkg(p => {
      delete p.exports;
      p.files = ['dist', 'components', 'templates'];
    });
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        '@acme/widgets/dist/AcmeWidget.js',
        "import {AcmeWidget} from '@acme/widgets/dist/AcmeWidget.js';\\n<AcmeWidget />",
      ),
    );
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(
      (result.data.notes ?? []).filter(i => i.code.includes('_not_exported')),
    ).toEqual([]);
    expect(result.data.publicImports?.unchecked).toEqual([
      expect.objectContaining({
        file: 'components/AcmeWidget.doc.mjs',
        specifier: '@acme/widgets/dist/AcmeWidget.js',
        reason: expect.stringContaining('build output'),
      }),
      expect.objectContaining({
        specifier: '@acme/widgets/dist/AcmeWidget.js',
      }),
    ]);
  });

  it('never maps a built .js path to the .tsx source in a fix', async () => {
    pkg(p => delete p.exports);
    write(
      'components/AcmeWidget.doc.mjs',
      DOC('@acme/widgets/components/AcmeWidget.js'),
    );
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).not.toContain(
      '"./components/AcmeWidget.js": "./components/AcmeWidget.tsx"',
    );
  });

  it('never requires an exports target to exist (build output)', async () => {
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {
        types: './dist/AcmeWidget.d.ts',
        import: './dist/AcmeWidget.js',
      };
    });
    expect(await codes()).toEqual([]);
  });
});

describe('public imports: component doc import', () => {
  it('flags a missing exports key with the entry to add', async () => {
    pkg(p => delete p.exports['./components/AcmeWidget']);
    const issues = await found();
    const issue = issues.find(i => i.code === 'component_import_not_exported');
    expect(issue).not.toHaveProperty('severity');
    expect(issue?.message).toContain(
      '"./components/AcmeWidget": "./components/AcmeWidget.tsx"',
    );
  });

  // One whole check per case, so each has the full test budget: the four
  // run back to back took most of one budget alone and timed out under load.
  describe('lists its findings only: neither validate nor --strict counts or fails on them', () => {
    beforeEach(() => {
      pkg(p => {
        delete p.exports['./components/AcmeWidget'];
      });
      write(
        'templates/account-card.tsx',
        "import {X} from '../components/AcmeWidget';\nexport default function A() {\n  return <X />;\n}\n",
      );
    });

    it('validate lists them as notes, with no severity, and counts none as an issue', async () => {
      const validated = await validateLocalIntegration(dir);
      const notes = (validated.notes ?? []).filter(note =>
        CODES.has(note.code),
      );
      expect(notes.length).toBeGreaterThan(2);
      expect(notes.every(note => !('severity' in note))).toBe(true);
      expect(validated.issues.filter(issue => CODES.has(issue.code))).toEqual(
        [],
      );
    });

    it('the integration check counts none of them', async () => {
      const plain = await integrationCheck({cwd: dir});
      expect(plain.data.errors).toBe(0);
      expect(plain.data.warnings).toBe(0);
    });

    it('--strict fails on none of them', async () => {
      const strict = await integrationCheck({cwd: dir, strict: true});
      expect(strict.data.failed).toBe(false);
      expect(strict.data.failures).toEqual([]);
    });
  });

  it('flags a require-only condition', async () => {
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {
        require: './components/AcmeWidget.tsx',
      };
    });
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain('only the "require" condition');
  });

  it('names the conditions a types-only entry has', async () => {
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {types: './a.d.ts'};
    });
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain('only the "types" condition');
    expect(issue?.message).not.toContain('require');
  });

  it('flags a bare-string exports field', async () => {
    pkg(p => {
      p.exports = './components/AcmeWidget.tsx';
    });
    const all = await codes();
    expect(all).toContain('component_import_not_exported');
    expect(all).toContain('template_import_not_exported');
  });

  it('flags a wildcard that does not match', async () => {
    pkg(p => {
      delete p.exports['./components/AcmeWidget'];
      p.exports['./widgets/*'] = './components/*.tsx';
    });
    expect(await codes()).toContain('component_import_not_exported');
  });

  it('points an undeclared import at the subpath already exported', async () => {
    write('components/AcmeWidget.doc.mjs', DOC('@acme/widgets/AcmeWidget'));
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain(
      "set import: '@acme/widgets/components/AcmeWidget' (already exported)",
    );
  });

  it('flags an import that names another package', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC('@acme/other/components/AcmeWidget'),
    );
    const issue = (await found()).find(
      i => i.code === 'component_import_other_package',
    );
    expect(issue?.message).toContain(
      "set import: '@acme/widgets/components/AcmeWidget'",
    );
  });
});

describe('public imports: component examples', () => {
  it('flags a name the package does not export', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeGadget} from '@acme/widgets/components/AcmeWidget';\\n<AcmeGadget />",
      ),
    );
    expect(await codes()).toEqual(['example_import_missing_name']);
    const issue = (await found()).find(
      i => i.code === 'example_import_missing_name',
    );
    expect(issue?.message).toContain(
      'import a name that module exports ("AcmeWidget" for this doc)',
    );
  });

  it("points a missing-name example at the doc's import only when that module exports the missing name", async () => {
    pkg(p => {
      p.exports['./other'] = './lib/other.ts';
    });
    write('lib/other.ts', 'export const Unrelated = 1;\n');
    write(
      'components/AcmeWidget.tsx',
      'export function AcmeWidget() {\n  return null;\n}\nexport function AcmeGadget() {\n  return null;\n}\n',
    );
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeGadget} from '@acme/widgets/other';\\n<AcmeGadget />",
      ),
    );
    const issue = (await found()).find(
      i => i.code === 'example_import_missing_name',
    );
    expect(issue?.message).not.toContain('for this doc');
    expect(issue?.message).toContain(
      "import from '@acme/widgets/components/AcmeWidget', as the doc's import does",
    );
    // Without the name there, the doc's import is no fix.
    write(
      'components/AcmeWidget.tsx',
      'export function AcmeWidget() {\n  return null;\n}\n',
    );
    const generic = (await found()).find(
      i => i.code === 'example_import_missing_name',
    );
    expect(generic?.message).toContain('Fix: Export the name from it.');
    expect(generic?.message).not.toContain("as the doc's import does");
  });

  it('flags a subpath exports does not declare', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeWidget} from '@acme/widgets/src/AcmeWidget';\\n<AcmeWidget />",
      ),
    );
    expect(await codes()).toEqual(['example_import_not_exported']);
  });

  it('points an undeclared example import at the doc import when that is declared', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeWidget} from '@acme/widgets/src/AcmeWidget';\\n<AcmeWidget />",
      ),
    );
    const issue = (await found()).find(
      i => i.code === 'example_import_not_exported',
    );
    expect(issue?.message).toContain(
      "Fix: import from '@acme/widgets/components/AcmeWidget' in the example, as the doc's import does.",
    );
  });

  it('never points an example back at the same undeclared doc import', async () => {
    pkg(p => delete p.exports['./components/AcmeWidget']);
    const issue = (await found()).find(
      i => i.code === 'example_import_not_exported',
    );
    expect(issue?.message).not.toContain('in the example, as the doc');
    expect(issue?.message).toContain(
      'add "./components/AcmeWidget": "./components/AcmeWidget.tsx" to package.json "exports"',
    );
  });

  it('gives the exports entry for a hooks path when the doc import lacks the hook', async () => {
    write(
      'components/useAcmeTheme.ts',
      'export function useAcmeTheme() {\n  return null;\n}\n',
    );
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {useAcmeTheme} from '@acme/widgets/components/useAcmeTheme';\\nuseAcmeTheme();",
      ),
    );
    const issue = (await found()).find(
      i => i.code === 'example_import_not_exported',
    );
    expect(issue?.message).not.toContain(
      "import from '@acme/widgets/components/AcmeWidget'",
    );
    expect(issue?.message).toContain(
      'add "./components/useAcmeTheme": "./components/useAcmeTheme.ts" to package.json "exports"',
    );
  });

  it('never points a side-effect import of an undeclared subpath at another subpath', async () => {
    write('styles.css', '.acme {}\n');
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(undefined, "import '@acme/widgets/styles.css';\\n<AcmeWidget />"),
    );
    const issue = (await found()).find(
      i => i.code === 'example_import_not_exported',
    );
    expect(issue?.message).not.toContain('in the example');
    expect(issue?.message).toContain(
      'add "./styles.css": "./styles.css" to package.json "exports"',
    );
  });

  it('points an example at the subpath the source is already exported under', async () => {
    pkg(p => {
      delete p.exports['./components/AcmeWidget'];
      p.exports['./widget'] = './components/AcmeWidget.tsx';
    });
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        '@acme/widgets/nope',
        "import {AcmeWidget} from '@acme/widgets/nope';\\n<AcmeWidget />",
      ),
    );
    const issue = (await found()).find(
      i => i.code === 'example_import_not_exported',
    );
    expect(issue?.message).toContain(
      "Fix: import from '@acme/widgets/widget' in the example (already exported).",
    );
  });

  it('leaves a CommonJS target unjudged for names', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeGadget} from '@acme/widgets/components/AcmeWidget';\\n<AcmeGadget />",
      ),
    );
    write(
      'components/AcmeWidget.tsx',
      'module.exports = {AcmeWidget: () => null, AcmeGadget: () => null};\n',
    );
    expect(await codes()).toEqual([]);
    pkg(p => {
      p.exports['./components/AcmeWidget'] = './components/AcmeWidget.cjs';
    });
    write('components/AcmeWidget.cjs', 'export const Other = 1;\n');
    expect(await codes()).toEqual([]);
  });

  it('accepts aliased, type-only and other-package imports', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeWidget as W, type AcmeWidgetProps} from '@acme/widgets/components/AcmeWidget';\\nimport {Button} from '@astryxdesign/core/Button';\\nimport x from 'left-pad';\\n<W label=\\\"a\\\" />",
      ),
    );
    expect(await codes()).toEqual([]);
  });

  it('reads named, default, aliased, namespace and type-only imports', () => {
    const statements = readImports(
      "import D, {A as B, type T} from 'p/a';\nimport type {U} from 'p/b';\nimport * as N from 'p/c';\n...\n<D />",
    );
    expect(statements.map(s => s.source)).toEqual(['p/a', 'p/b', 'p/c']);
    expect(statements[0].names).toEqual([
      {imported: 'default', typeOnly: false},
      {imported: 'A', typeOnly: false},
      {imported: 'T', typeOnly: true},
    ]);
    expect(statements[1].names).toEqual([{imported: 'U', typeOnly: true}]);
    expect(statements[2].namespace).toBe(true);
  });
});

describe('public imports: template sources', () => {
  it('flags a relative import that leaves the templates root', async () => {
    write(
      'templates/account-card.tsx',
      'import {AcmeWidget} from \'../components/AcmeWidget\';\nexport default function A() {\n  return <AcmeWidget label="x" />;\n}\n',
    );
    expect(await codes()).toEqual(['template_import_outside_root']);
  });

  it('flags a Core path Core does not export, and accepts a public one', async () => {
    write(
      'templates/account-card.tsx',
      'import {Button} from \'@astryxdesign/core/src/Button/Button\';\nexport default function A() {\n  return <Button label="x" />;\n}\n',
    );
    const issue = (await found()).find(
      i => i.code === 'template_private_import',
    );
    expect(issue?.message).toContain("'@astryxdesign/core/Button'");
    write(
      'templates/account-card.tsx',
      'import {Button} from \'@astryxdesign/core/Button\';\nexport default function A() {\n  return <Button label="x" />;\n}\n',
    );
    expect(await codes()).toEqual([]);
  });

  it('flags a name its own package does not export', async () => {
    write(
      'templates/account-card.tsx',
      'import {AcmeGadget} from \'@acme/widgets/components/AcmeWidget\';\nexport default function A() {\n  return <AcmeGadget label="x" />;\n}\n',
    );
    expect(await codes()).toEqual(['template_import_missing_name']);
  });

  it('leaves a built CommonJS dist file reached through exports unjudged for names', async () => {
    pkg(p => {
      p.exports['./components/AcmeWidget'] = {
        types: './dist/AcmeWidget.d.ts',
        default: './dist/AcmeWidget.js',
      };
    });
    write(
      'dist/AcmeWidget.js',
      "'use strict';\nObject.defineProperty(exports, '__esModule', {value: true});\nexports.AcmeWidget = void 0;\nconst AcmeWidget = () => null;\nexports.AcmeWidget = AcmeWidget;\n",
    );
    write(
      'templates/account-card.tsx',
      'import {AcmeGadget} from \'@acme/widgets/components/AcmeWidget\';\nexport default function A() {\n  return <AcmeGadget label="x" />;\n}\n',
    );
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {AcmeGadget} from '@acme/widgets/components/AcmeWidget';\\n<AcmeGadget />",
      ),
    );
    expect(await codes()).toEqual([]);
  });

  it('leaves a module that also assigns exports.* unjudged for names', async () => {
    write(
      'components/AcmeWidget.tsx',
      'export function AcmeWidget() {\n  return null;\n}\nexports.AcmeGadget = AcmeWidget;\n',
    );
    write(
      'templates/account-card.tsx',
      'import {AcmeGadget} from \'@acme/widgets/components/AcmeWidget\';\nexport default function A() {\n  return <AcmeGadget label="x" />;\n}\n',
    );
    expect(await codes()).toEqual([]);
  });

  it('leaves a CommonJS target of a template import unjudged for names', async () => {
    write('components/AcmeWidget.tsx', 'exports.AcmeWidget = () => null;\n');
    write(
      'templates/account-card.tsx',
      'import {AcmeGadget} from \'@acme/widgets/components/AcmeWidget\';\nexport default function A() {\n  return <AcmeGadget label="x" />;\n}\n',
    );
    expect(await codes()).toEqual([]);
  });

  it('flags a template whose public import exports does not declare', async () => {
    pkg(p => delete p.exports['./templates/account-card']);
    const issue = (await found()).find(
      i => i.code === 'template_import_not_exported',
    );
    expect(issue?.message).toContain(
      '"./templates/account-card": "./templates/account-card.tsx"',
    );
  });
});

describe('template default export', () => {
  it('lists a template source with no default export, naming the export to add', async () => {
    write(
      'templates/account-card.tsx',
      'export function AccountCard() {\n  return <div>Account</div>;\n}\n',
    );
    const issues = await found();
    expect(issues.map(i => i.code)).toEqual(['template_no_default_export']);
    expect(issues[0].message).toContain('export default AccountCard;');
  });

  it('suggests a value, never a type, as the default export', async () => {
    write(
      'templates/account-card.tsx',
      'export interface AccountCardProps {\n  title: string;\n}\nexport type AccountCardSize = "sm";\nexport function AccountCard() {\n  return <div>Account</div>;\n}\n',
    );
    const issue = (await found()).find(
      i => i.code === 'template_no_default_export',
    );
    expect(issue?.message).toContain('export default AccountCard;');
    expect(issue?.message).not.toContain('AccountCardProps;');
  });

  it('accepts a re-exported or type-annotated default', async () => {
    write(
      'templates/account-card.tsx',
      'function AccountCard() {\n  return <div>Account</div>;\n}\nexport {AccountCard as default};\n',
    );
    expect(await codes()).toEqual([]);
  });
});

describe('subpathDeclaration', () => {
  it('reads each way exports can declare a subpath', () => {
    expect(subpathDeclaration(undefined, './a').state).toBe('no_exports');
    expect(subpathDeclaration('./i.js', './a').state).toBe('root_only');
    expect(subpathDeclaration({import: './i.js'}, './a').state).toBe(
      'root_only',
    );
    expect(subpathDeclaration({'./a': null}, './a').state).toBe('blocked');
    expect(subpathDeclaration({'./a': {require: './a.cjs'}}, './a').state).toBe(
      'not_importable',
    );
    expect(subpathDeclaration({'./*': './src/*.ts'}, './a').state).toBe(
      'declared',
    );
    expect(
      subpathDeclaration(
        {'./*': './src/*.ts', './private/*': null},
        './private/a',
      ).state,
    ).toBe('blocked');
  });
});

describe('derived component imports', () => {
  const NO_IMPORT = `export default {
  type: 'component',
  name: 'AcmeWidget',
  displayName: 'Acme Widget',
  usage: {description: 'A pressable widget.'},
  props: [{name: 'label', type: 'string', description: 'Text.', required: true}],
};
`;

  it('warns when the derived root import does not export the component, naming the subpath that does', async () => {
    write('components/AcmeWidget.doc.mjs', NO_IMPORT);
    write('index.js', 'export const Other = 1;\n');
    pkg(p => {
      p.exports['.'] = './index.js';
    });
    const issues = (await found()).filter(
      i => i.code === 'component_import_missing_name',
    );
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toContain(
      'has no import, so apps are told to import from "@acme/widgets"',
    );
    expect(issues[0].message).toContain(
      "set import: '@acme/widgets/components/AcmeWidget' in the doc",
    );
  });

  it('names the wildcard subpath the component is already exported under', async () => {
    write('index.js', 'export const Other = 1;\n');
    pkg(p => {
      p.exports = {
        '.': './index.js',
        './components/*': './components/*.tsx',
        './templates/account-card': './templates/account-card.tsx',
      };
    });
    write('components/AcmeWidget.doc.mjs', DOC('@acme/widgets'));
    const issue = (await found()).find(
      i => i.code === 'component_import_missing_name',
    );
    expect(issue?.message).toContain(
      "set import: '@acme/widgets/components/AcmeWidget' in the doc (that subpath exports it)",
    );
    expect(issue?.message).not.toContain('add "./components/AcmeWidget"');
  });

  it('warns when the derived root import is not declared', async () => {
    write('components/AcmeWidget.doc.mjs', NO_IMPORT);
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain(
      'has no import, so apps are told to import from "@acme/widgets"',
    );
  });

  it('warns when a written import does not export the component', async () => {
    write('index.js', 'export const Other = 1;\n');
    pkg(p => {
      p.exports['.'] = './index.js';
    });
    write('components/AcmeWidget.doc.mjs', DOC('@acme/widgets'));
    expect(await codes()).toContain('component_import_missing_name');
  });

  it('warns when a written import does not export the component, even while the package augments a module', async () => {
    write('index.js', 'export const Other = 1;\n');
    write(
      'types/augment.d.ts',
      "declare module '@acme/widgets' {\n  interface AcmeTone {}\n}\nexport {};\n",
    );
    pkg(p => {
      p.exports['.'] = './index.js';
    });
    write('components/AcmeWidget.doc.mjs', DOC('@acme/widgets'));
    expect(await codes()).toContain('component_import_missing_name');
  });

  it('lists a derived import whose target is not built as not checked', async () => {
    write('components/AcmeWidget.doc.mjs', NO_IMPORT);
    pkg(p => {
      p.exports['.'] = {types: './dist/index.d.ts', import: './dist/index.js'};
    });
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(
      (result.data.notes ?? []).filter(i =>
        i.code.startsWith('component_import'),
      ),
    ).toEqual([]);
    expect(result.data.publicImports?.unchecked).toEqual([
      expect.objectContaining({
        file: 'components/AcmeWidget.doc.mjs',
        specifier: '@acme/widgets',
        reason: expect.stringContaining('build output'),
      }),
    ]);
    const check = await integrationCheck({cwd: dir, strict: true});
    expect(check.data.unchecked).toBe(1);
    expect(check.data.failed).toBe(false);
  });
});

describe('fixes for two components in one folder', () => {
  const docFor = (/** @type {string} */ name) => `export default {
  type: 'component',
  name: '${name}',
  displayName: '${name}',
  usage: {description: 'A widget.'},
  props: [],
};
`;

  beforeEach(() => {
    for (const name of ['AcmeAlpha', 'AcmeBeta']) {
      write(`components/${name}.doc.mjs`, docFor(name));
      write(
        `components/${name}.tsx`,
        `export function ${name}() {\n  return null;\n}\n`,
      );
    }
  });

  it('gives each import-less component its own entry, never the root', async () => {
    const fixes = (await found())
      .filter(i => i.code === 'component_import_not_exported')
      .map(i => i.message.split('Fix: ')[1]);
    expect(fixes).toEqual(
      expect.arrayContaining([
        `add "./components/AcmeAlpha": "./components/AcmeAlpha.tsx" to package.json "exports" and set import: '@acme/widgets/components/AcmeAlpha' in the doc.`,
        `add "./components/AcmeBeta": "./components/AcmeBeta.tsx" to package.json "exports" and set import: '@acme/widgets/components/AcmeBeta' in the doc.`,
      ]),
    );
    for (const fix of fixes) expect(fix).not.toContain('".":');
  });

  it('gives each a per-component entry when the derived folder subpath lacks it', async () => {
    write('components/index.js', 'export const Other = 1;\n');
    pkg(p => {
      p.exports['./components'] = './components/index.js';
      p.exports['.'] = './components/index.js';
    });
    const fixes = (await found())
      .filter(i => i.code === 'component_import_missing_name')
      .map(i => i.message.split('Fix: ')[1]);
    expect(fixes).toHaveLength(2);
    expect(fixes[0]).toContain(
      `add "./components/AcmeAlpha": "./components/AcmeAlpha.tsx" to package.json "exports" and set import: '@acme/widgets/components/AcmeAlpha' in the doc`,
    );
    expect(fixes[1]).toContain(
      '"./components/AcmeBeta": "./components/AcmeBeta.tsx"',
    );
    for (const fix of fixes) expect(fix).not.toContain('"./components":');
  });

  it('never offers a per-component entry when the source exports the component only as default', async () => {
    write('components/index.js', 'export const Other = 1;\n');
    write(
      'components/AcmeAlpha.tsx',
      'export default function AcmeAlpha() {\n  return null;\n}\n',
    );
    pkg(p => {
      p.exports['./components'] = './components/index.js';
      p.exports['.'] = './components/index.js';
    });
    const fix = (await found())
      .filter(i => i.code === 'component_import_missing_name')
      .map(i => i.message.split('Fix: ')[1])
      .find(text => text.includes('"AcmeAlpha"'));
    expect(fix).toBe(
      'export "AcmeAlpha" from the module "@acme/widgets/components" loads.',
    );
  });
});

describe('type-only imports', () => {
  it.each([
    [
      'a statement-level import type',
      {'./types': {types: './types.d.ts'}},
      {'types.d.ts': 'export type AcmeWidgetSize = "sm" | "md";\n'},
      "import type {AcmeWidgetSize} from '@acme/widgets/types';",
    ],
    [
      'an import whose every binding is an inline type',
      {'./types': {types: './types.d.ts'}},
      {'types.d.ts': 'export type AcmeWidgetSize = "sm" | "md";\n'},
      "import {type AcmeWidgetSize} from '@acme/widgets/types';",
    ],
    [
      'a plain import of names the types file declares as types',
      {'./types': {types: './types.d.ts'}},
      {
        'types.d.ts':
          'export type AcmeWidgetSize = "sm" | "md";\ninterface AcmeTone {}\nexport {type AcmeTone as Tone};\n',
      },
      "import {AcmeWidgetSize, Tone} from '@acme/widgets/types';",
    ],
    [
      'a plain import of a declared type (wildcard entry)',
      {'./types/*': {types: './types/*.d.ts'}},
      {'types/size.d.ts': 'export type AcmeWidgetSize = "sm" | "md";\n'},
      "import {AcmeWidgetSize} from '@acme/widgets/types/size';",
    ],
    [
      'a statement-level import type (types beside only require)',
      {'./legacy': {types: './legacy.d.ts', require: './legacy.cjs'}},
      {'legacy.d.ts': 'export type AcmeLegacy = string;\n'},
      "import type {AcmeLegacy} from '@acme/widgets/legacy';",
    ],
    [
      'a plain import of a declared type (types beside only require)',
      {'./legacy': {types: './legacy.d.ts', require: './legacy.cjs'}},
      {'legacy.d.ts': 'export type AcmeLegacy = string;\n'},
      "import {AcmeLegacy} from '@acme/widgets/legacy';",
    ],
  ])(
    'accepts %s from a subpath with a types target',
    async (_label, entries, files, typeImport) => {
      pkg(p => {
        Object.assign(p.exports, entries);
      });
      for (const [file, text] of Object.entries(files)) write(file, text);
      write(
        'components/AcmeWidget.doc.mjs',
        DOC(
          undefined,
          `${typeImport}\\nimport {AcmeWidget} from '@acme/widgets/components/AcmeWidget';\\n<AcmeWidget />`,
        ),
      );
      expect(await codes()).toEqual([]);
      const report = (await validateLocalIntegration(dir)).publicImports;
      expect(report?.unchecked).toEqual([]);
    },
  );

  it('notes an import type whose only types target sits under require', async () => {
    pkg(p => {
      p.exports['./legacy'] = {
        require: {types: './legacy.d.cts', default: './legacy.cjs'},
      };
    });
    write('legacy.d.cts', 'export type AcmeLegacy = string;\n');
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import type {AcmeLegacy} from '@acme/widgets/legacy';\\nimport {AcmeWidget} from '@acme/widgets/components/AcmeWidget';\\n<AcmeWidget />",
      ),
    );
    expect(await codes()).not.toEqual([]);
  });

  it('lists a value import from a subpath with types beside only require as not checked', async () => {
    pkg(p => {
      p.exports['./legacy'] = {types: './legacy.d.ts', require: './legacy.cjs'};
    });
    write('legacy.d.ts', 'export declare const acmeLegacy: string;\n');
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {acmeLegacy} from '@acme/widgets/legacy';\\nimport {AcmeWidget} from '@acme/widgets/components/AcmeWidget';\\n<AcmeWidget />",
      ),
    );
    expect(await codes()).toEqual([]);
    const report = (await validateLocalIntegration(dir)).publicImports;
    expect(report?.unchecked.map(u => u.specifier)).toEqual([
      '@acme/widgets/legacy',
    ]);
  });

  it('lists a value or unreadable import from a types-only subpath as not checked, never a note', async () => {
    pkg(p => {
      p.exports['./types'] = {types: './types.d.ts'};
      p.exports['./gone'] = {types: './gone.d.ts'};
    });
    write(
      'types.d.ts',
      'export type AcmeWidgetSize = "sm";\nexport declare const ACME_SIZES: string[];\n',
    );
    write(
      'components/AcmeWidget.doc.mjs',
      DOC(
        undefined,
        "import {type AcmeWidgetSize, ACME_SIZES} from '@acme/widgets/types';\\nimport {Gone} from '@acme/widgets/gone';\\nimport type {X} from '@acme/widgets/nope';\\n<AcmeWidget />",
      ),
    );
    const notes = await found();
    expect(notes.map(n => n.code)).toEqual(['example_import_not_exported']);
    expect(notes[0].message).toContain('@acme/widgets/nope');
    expect(notes[0].message).not.toContain('"default"');
    const report = (await validateLocalIntegration(dir)).publicImports;
    expect(report?.unchecked.map(u => u.specifier).sort()).toEqual([
      '@acme/widgets/gone',
      '@acme/widgets/types',
    ]);
    expect(
      report?.unchecked.find(u => u.specifier === '@acme/widgets/types')
        ?.reason,
    ).toContain('ACME_SIZES');
  });
});

describe('an empty exports map', () => {
  it('names the missing subpath and adds only that entry', async () => {
    pkg(p => {
      p.exports = {};
    });
    const issue = (await found()).find(
      i => i.code === 'component_import_not_exported',
    );
    expect(issue?.message).toContain(
      'package.json "exports" does not declare "./components/AcmeWidget"',
    );
    expect(issue?.message).toContain(
      'add "./components/AcmeWidget": "./components/AcmeWidget.tsx" to package.json "exports"',
    );
    expect(issue?.message).not.toContain('subpath map');
    expect(subpathDeclaration({}, '.').state).toBe('missing');
    expect(subpathDeclaration({}, './a').state).toBe('missing');
  });
});

describe('imports listed as not checked', () => {
  it('lists a template import of Core when Core is not installed', () => {
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-no-core-'));
    try {
      const put = (/** @type {string} */ rel, /** @type {string} */ text) => {
        fs.mkdirSync(path.dirname(path.join(out, rel)), {recursive: true});
        fs.writeFileSync(path.join(out, rel), text);
      };
      put(
        'package.json',
        JSON.stringify({
          name: '@acme/widgets',
          version: '1.0.0',
          type: 'module',
          exports: {'./templates/account-card': './templates/account-card.tsx'},
        }),
      );
      put(
        'astryx.integration.mjs',
        "export default {templates: './templates'};\n",
      );
      put('templates/account-card.doc.mjs', BLOCK());
      put(
        'templates/account-card.tsx',
        "import {Button} from '@astryxdesign/core/src/Button';\nexport default function A() {\n  return <Button />;\n}\n",
      );
      const run = spawnSync(
        process.execPath,
        [
          path.join(CLI_ROOT, 'clients/cli/bin/astryx.mjs'),
          '--json',
          'doctor',
          'integration',
          'validate',
        ],
        {cwd: out, encoding: 'utf-8', timeout: 60_000},
      );
      const {data} = JSON.parse(run.stdout);
      expect(
        data.issues.filter(
          (/** @type {{code: string}} */ i) =>
            i.code === 'template_private_import',
        ),
      ).toEqual([]);
      expect(data.publicImports.unchecked).toEqual([
        expect.objectContaining({
          file: 'templates/account-card.tsx',
          specifier: '@astryxdesign/core/src/Button',
        }),
      ]);
    } finally {
      fs.rmSync(out, {recursive: true, force: true});
    }
  }, 60_000);

  it('lists template and example imports whose names cannot be judged', async () => {
    pkg(p => {
      p.exports['./built'] = './dist/built.js';
      p.exports['./cjs'] = './cjs.cjs';
    });
    write('cjs.cjs', 'module.exports = {A: 1};\n');
    write(
      'templates/account-card.tsx',
      "import {Built} from '@acme/widgets/built';\nimport {A} from '@acme/widgets/cjs';\nimport {AcmeWidget} from '@acme/widgets/components/AcmeWidget';\nexport default function C() {\n  return <AcmeWidget label=\"x\" />;\n}\n",
    );
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(result.data.issues).toEqual([]);
    expect(
      result.data.publicImports?.unchecked.map(u => [u.file, u.specifier]),
    ).toEqual([
      ['templates/account-card.tsx', '@acme/widgets/built'],
      ['templates/account-card.tsx', '@acme/widgets/cjs'],
    ]);
    const check = await integrationCheck({cwd: dir, strict: true});
    expect(check.data.unchecked).toBe(2);
    expect(check.data.failed).toBe(false);
  });
});

describe('a root import in a package with no exports', () => {
  it('says the package has no exports map', async () => {
    pkg(p => delete p.exports);
    write(
      'templates/account-card.tsx',
      'import {AcmeWidget} from \'@acme/widgets\';\nexport default function C() {\n  return <AcmeWidget label="x" />;\n}\n',
    );
    const result = await validateIntegration(undefined, {cwd: dir});
    const entry = result.data.publicImports?.unchecked.find(
      u => u.file === 'templates/account-card.tsx',
    );
    expect(entry?.reason).toContain('package.json has no "exports"');
    expect(entry?.reason).not.toContain('build output');
  });
});

describe('a fresh scaffold passes the checks', () => {
  for (const exportsMap of [undefined, {'.': './index.js'}]) {
    it(`with ${exportsMap ? 'an' : 'no'} exports map`, async () => {
      fs.rmSync(dir, {recursive: true, force: true});
      fs.mkdirSync(dir);
      write(
        'package.json',
        JSON.stringify({
          name: '@acme/fresh',
          version: '1.0.0',
          type: 'module',
          ...(exportsMap ? {exports: exportsMap} : {}),
        }),
      );
      write('index.js', 'export {};\n');
      await integrationAddComponent('AcmeThing', {cwd: dir});
      await integrationAddTemplate('acme-page', {cwd: dir});
      const check = await integrationCheck({cwd: dir, strict: true});
      expect(check.data.failures).toEqual([]);
    });
  }
});

describe('export * cycles and repeated checks', () => {
  beforeEach(() => {
    pkg(p => {
      p.exports['./a'] = './lib/a.ts';
      p.exports['./b'] = './lib/b.ts';
    });
    write('lib/a.ts', "export const A = 1;\nexport * from './b';\n");
    write('lib/b.ts', "export * from './a';\nexport const B = 2;\n");
  });

  it('reads every name through an export * cycle, from either side', async () => {
    write(
      'templates/account-card.tsx',
      "import {A, B} from '@acme/widgets/a';\nimport {A as A2, B as B2} from '@acme/widgets/b';\nimport {AcmeWidget} from '@acme/widgets/components/AcmeWidget';\nexport default function C() {\n  return <AcmeWidget label={String(A + B + A2 + B2)} />;\n}\n",
    );
    expect(await codes()).toEqual([]);
  });

  it('rereads a re-exported module on a second check in the same process', async () => {
    write('lib/b.ts', 'export const B = 2;\n');
    write('lib/c.ts', "export * from './b';\n");
    pkg(p => {
      p.exports['./c'] = './lib/c.ts';
    });
    write(
      'templates/account-card.tsx',
      "import {C} from '@acme/widgets/c';\nexport default function T() {\n  return <div>{C}</div>;\n}\n",
    );
    expect(await codes()).toEqual(['template_import_missing_name']);
    // Fix only the re-exported module: c.ts itself does not change.
    write('lib/b.ts', 'export const B = 2;\nexport const C = 3;\n');
    expect(await codes()).toEqual([]);
  });
});

describe('export import declarations', () => {
  it('counts `export import Alias = Inner.Value` as an exported name', async () => {
    pkg(p => {
      p.exports['./ns'] = './lib/ns.ts';
    });
    write(
      'lib/ns.ts',
      'namespace Inner {\n  export const Value = 1;\n}\nexport const Other = 2;\nexport import Alias = Inner.Value;\n',
    );
    write(
      'templates/account-card.tsx',
      "import {Alias} from '@acme/widgets/ns';\nexport default function C() {\n  return <div>{Alias}</div>;\n}\n",
    );
    expect(await codes()).toEqual([]);
  });

  it('leaves a module with a type-only export import unjudged', async () => {
    pkg(p => {
      p.exports['./ns'] = './lib/ns.ts';
    });
    write(
      'lib/ns.ts',
      "export const Kept = 1;\nexport import type Alias = require('./other');\n",
    );
    write(
      'templates/account-card.tsx',
      "import {Other} from '@acme/widgets/ns';\nexport default function C() {\n  return <div>{Other}</div>;\n}\n",
    );
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(
      (result.data.notes ?? []).filter(
        i => i.code === 'template_import_missing_name',
      ),
    ).toEqual([]);
    expect(
      result.data.publicImports?.unchecked.map(u => u.specifier),
    ).toContain('@acme/widgets/ns');
  });
});

describe('types from a built package', () => {
  it('reads a type re-exported through export * in a declaration file', async () => {
    pkg(p => {
      p.exports['./widget'] = {
        types: './dist/widget.d.ts',
        import: './dist/widget.js',
      };
    });
    write(
      'dist/widget.js',
      "export * from './types.js';\nexport const AcmeWidget = () => null;\n",
    );
    write(
      'dist/widget.d.ts',
      "export * from './types.js';\nexport declare const AcmeWidget: () => null;\n",
    );
    write('dist/types.js', 'export {};\n');
    write(
      'dist/types.d.ts',
      'export interface AcmeWidgetProps {\n  label: string;\n}\n',
    );
    write(
      'templates/account-card.tsx',
      "import {AcmeWidget, AcmeWidgetProps} from '@acme/widgets/widget';\nexport default function C(props: AcmeWidgetProps) {\n  return <AcmeWidget {...props} />;\n}\n",
    );
    expect(await codes()).toEqual([]);
  });

  it('reads the declaration file beside a .js export target', async () => {
    pkg(p => {
      p.exports['./built'] = './dist/built.js';
    });
    write('dist/built.js', 'export const AcmeThing = 1;\n');
    write(
      'dist/built.d.ts',
      'export declare const AcmeThing: number;\nexport type AcmeThingSize = "sm" | "md";\n',
    );
    write(
      'templates/account-card.tsx',
      "import {AcmeThing, AcmeThingSize} from '@acme/widgets/built';\nexport default function C() {\n  const size: AcmeThingSize = 'sm';\n  return <div>{AcmeThing}{size}</div>;\n}\n",
    );
    expect(await codes()).toEqual([]);
  });

  it('still warns on a name neither the module nor its declarations export', async () => {
    pkg(p => {
      p.exports['./built'] = './dist/built.js';
    });
    write('dist/built.js', 'export const AcmeThing = 1;\n');
    write('dist/built.d.ts', 'export declare const AcmeThing: number;\n');
    write(
      'templates/account-card.tsx',
      "import {AcmeOther} from '@acme/widgets/built';\nexport default function C() {\n  return <div>{AcmeOther}</div>;\n}\n",
    );
    expect(await codes()).toEqual(['template_import_missing_name']);
  });
});

describe('which Core and which package', () => {
  it("lists Core imports as not checked when the found core is a workspace's own package", async () => {
    // An npm-workspaces monorepo: its own packages/core is @acme/core, and
    // the integration lives in packages/widgets.
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-workspace-'));
    try {
      const put = (/** @type {string} */ rel, /** @type {string} */ text) => {
        fs.mkdirSync(path.dirname(path.join(root, rel)), {recursive: true});
        fs.writeFileSync(path.join(root, rel), text);
      };
      put(
        'package.json',
        JSON.stringify({
          name: 'acme-monorepo',
          private: true,
          workspaces: ['packages/*'],
        }),
      );
      put(
        'packages/core/package.json',
        JSON.stringify({
          name: '@acme/core',
          version: '1.0.0',
          exports: {'.': './index.js'},
        }),
      );
      put(
        'packages/widgets/package.json',
        JSON.stringify({
          name: '@acme/widgets',
          version: '1.0.0',
          type: 'module',
          exports: {'./templates/account-card': './templates/account-card.tsx'},
        }),
      );
      put(
        'packages/widgets/astryx.integration.mjs',
        "export default {templates: './templates'};\n",
      );
      put('packages/widgets/templates/account-card.doc.mjs', BLOCK());
      put(
        'packages/widgets/templates/account-card.tsx',
        "import {Button} from '@astryxdesign/core/Button';\nexport default function A() {\n  return <Button />;\n}\n",
      );
      const result = await validateIntegration(undefined, {
        cwd: path.join(root, 'packages/widgets'),
      });
      expect(
        (result.data.notes ?? []).filter(
          i => i.code === 'template_private_import',
        ),
      ).toEqual([]);
      expect(result.data.publicImports?.unchecked).toEqual([
        expect.objectContaining({
          file: 'templates/account-card.tsx',
          specifier: '@astryxdesign/core/Button',
        }),
      ]);
    } finally {
      fs.rmSync(root, {recursive: true, force: true});
    }
  });

  it('with no package name, runs only the checks that need none and lists the rest as not checked', async () => {
    pkg(p => delete p.name);
    write(
      'templates/account-card.tsx',
      "import {AcmeWidget} from '../components/AcmeWidget';\nimport {X} from '@acme/widgets/nope';\nexport default function C() {\n  return <AcmeWidget label={X} />;\n}\n",
    );
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual(['template_import_outside_root']);
    expect(result.data.publicImports?.status).toBe('checked');
    expect(result.data.publicImports?.unchecked).toContainEqual(
      expect.objectContaining({
        file: 'package.json',
        reason: expect.stringContaining('no "name"'),
      }),
    );
    // Nothing from the public-import check fails `integration check
    // --strict`: no skip, no warning (other checks may report the missing
    // name themselves).
    const {warnings, skipped} = strictIssues('validate', result);
    expect(
      [...warnings, ...skipped].filter(
        each => CODES.has(each.code) || each.code === 'public_imports_skipped',
      ),
    ).toEqual([]);
  });
});

describe('what the export-list reader does not model is not checked', () => {
  const template = (/** @type {string} */ names, /** @type {string} */ from) =>
    `import {${names}} from '${from}';\nexport default function C() {\n  return <div />;\n}\n`;

  it('lists a name as not checked when a declared types target is not built yet', async () => {
    pkg(p => {
      p.exports['./widget'] = {
        types: './dist/widget.d.ts',
        import: './src/widget.ts',
      };
    });
    write('src/widget.ts', 'export const AcmeThing = 1;\n');
    write(
      'templates/account-card.tsx',
      template('AcmeThing, AcmeThingProps', '@acme/widgets/widget'),
    );
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(result.data.publicImports?.unchecked).toEqual([
      expect.objectContaining({
        specifier: '@acme/widgets/widget',
        reason: expect.stringContaining('does not exist yet'),
      }),
    ]);
  });

  it('resolves a .js specifier in TypeScript source to the .ts file beside it', async () => {
    pkg(p => {
      p.exports['./widget'] = './src/widget.ts';
    });
    write('src/widget.ts', "export * from './inner.js';\n");
    write('src/inner.ts', 'export const Inner = 1;\nexport const Newer = 2;\n');
    // A stale build of inner beside its source, without the newer export.
    write('src/inner.js', 'export const Inner = 1;\n');
    write(
      'templates/account-card.tsx',
      template('Newer', '@acme/widgets/widget'),
    );
    expect(await codes()).toEqual([]);
  });

  it('reads the declaration file beside a module an export * reaches', async () => {
    pkg(p => {
      p.exports['./widget'] = './dist/index.js';
    });
    write('dist/index.js', "export * from './inner.js';\n");
    write('dist/inner.js', 'export const Inner = 1;\n');
    write(
      'dist/inner.d.ts',
      'export declare const Inner: number;\nexport interface InnerProps {\n  size: string;\n}\n',
    );
    write(
      'templates/account-card.tsx',
      template('Inner, InnerProps', '@acme/widgets/widget'),
    );
    expect(await codes()).toEqual([]);
  });

  it('does not judge a name a JavaScript module without declarations lacks, since it may be a type', async () => {
    pkg(p => {
      p.exports['./widget'] = './dist/widget.js';
    });
    write('dist/widget.js', 'export const AcmeThing = 1;\n');
    write(
      'templates/account-card.tsx',
      template('AcmeThing, AcmeThingProps', '@acme/widgets/widget'),
    );
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(result.data.publicImports?.unchecked.map(u => u.specifier)).toEqual([
      '@acme/widgets/widget',
    ]);
  });
});

describe('declaration files follow TypeScript', () => {
  const template = (/** @type {string} */ names) =>
    `import {${names}} from '@acme/widgets/widget';\nexport default function C() {\n  return <div />;\n}\n`;

  beforeEach(() => {
    pkg(p => {
      p.exports['./widget'] = './dist/widget.js';
    });
    write('dist/widget.js', 'export const AcmeWidget = () => null;\n');
  });

  it('counts every top-level declaration of a declaration-file module as exported', async () => {
    write(
      'dist/widget.d.ts',
      'interface AcmeWidgetProps {\n  label: string;\n}\nexport declare const AcmeWidget: (p: AcmeWidgetProps) => null;\n',
    );
    write(
      'templates/account-card.tsx',
      template('AcmeWidget, AcmeWidgetProps'),
    );
    expect(await codes()).toEqual([]);
  });

  it('exports only what is listed once the declaration file has an export list', async () => {
    write(
      'dist/widget.d.ts',
      'interface AcmeWidgetProps {\n  label: string;\n}\ndeclare const AcmeWidget: (p: AcmeWidgetProps) => null;\nexport {AcmeWidget};\n',
    );
    write(
      'templates/account-card.tsx',
      template('AcmeWidget, AcmeWidgetProps'),
    );
    expect(await codes()).toEqual(['template_import_missing_name']);
  });

  // A `declare module './widget.js'` block in a file widget.d.ts loads adds
  // names widget.d.ts itself does not list.
  const AUGMENT =
    "import './widget.js';\ndeclare module './widget.js' {\n  interface AcmeWidgetSize {\n    value: string;\n  }\n}\nexport {};\n";
  const LISTED =
    'declare const AcmeWidget: () => null;\nexport {AcmeWidget};\n';

  for (const [form, head] of [
    ['a side-effect import', "import './augment.js';\n"],
    ['a reference directive', '/// <reference path="./augment.d.ts" />\n'],
  ]) {
    it(`does not report a name added by augmentation in a file loaded through ${form}`, async () => {
      write('dist/augment.d.ts', AUGMENT);
      write('dist/widget.d.ts', `${head}${LISTED}`);
      write(
        'templates/account-card.tsx',
        template('AcmeWidget, AcmeWidgetSize'),
      );
      const result = await validateIntegration(undefined, {cwd: dir});
      expect(await codes()).toEqual([]);
      expect(
        result.data.publicImports?.unchecked.map(u => u.specifier),
      ).toEqual(['@acme/widgets/widget']);
    });
  }

  it('still reports a missing name when no file in the package augments a module', async () => {
    write('dist/widget.d.ts', LISTED);
    write('templates/account-card.tsx', template('AcmeWidget, AcmeWidgetSize'));
    expect(await codes()).toEqual(['template_import_missing_name']);
  });

  it.each([
    [
      'a `declare module` example in a JSDoc comment',
      "/**\n * @example\n * declare module './widget.js' {\n *   interface AcmeWidgetSize {}\n * }\n */\nexport type AcmeTone = 'a';\n",
    ],
    [
      'a wildcard `declare module`',
      "declare module '*.doc.mjs' {\n  const doc: unknown;\n  export default doc;\n}\n",
    ],
    [
      'a `declare global` block',
      'declare global {\n  interface AcmeGlobal {}\n}\nexport {};\n',
    ],
    [
      "an augmentation of another package's module",
      "declare module '@astryxdesign/core' {\n  interface AcmeTone {}\n}\nexport {};\n",
    ],
  ])('still reports a missing name beside %s', async (_label, text) => {
    write('dist/augment.d.ts', text);
    write('dist/widget.d.ts', LISTED);
    write('templates/account-card.tsx', template('AcmeWidget, AcmeWidgetSize'));
    expect(await codes()).toEqual(['template_import_missing_name']);
  });

  it("lists a name as not checked when a file augments the package's own name", async () => {
    write(
      'types/augment.d.ts',
      "declare module '@acme/widgets/widget' {\n  interface AcmeWidgetSize {}\n}\nexport {};\n",
    );
    write('dist/widget.d.ts', LISTED);
    write('templates/account-card.tsx', template('AcmeWidget, AcmeWidgetSize'));
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(
      result.data.publicImports?.unchecked.map(u => u.reason).join('\n'),
    ).toContain('"types/augment.d.ts"');
  });

  it('lists a name as not checked whenever any file in the package augments a module, even one nothing loads', async () => {
    write('dist/augment.d.ts', AUGMENT);
    write('dist/widget.d.ts', LISTED);
    write('templates/account-card.tsx', template('AcmeWidget, AcmeWidgetSize'));
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(result.data.publicImports?.unchecked).toEqual([
      expect.objectContaining({
        specifier: '@acme/widgets/widget',
        reason: expect.stringContaining('"dist/augment.d.ts"'),
      }),
    ]);
  });

  it('lists a name as not checked when the module re-exports from the augmenting file', async () => {
    write('dist/augment.d.ts', AUGMENT);
    write(
      'dist/widget.d.ts',
      `${LISTED}export {AcmeWidgetTone} from './augment.js';\n`,
    );
    write('templates/account-card.tsx', template('AcmeWidget, AcmeWidgetSize'));
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(
      result.data.publicImports?.unchecked.map(u => u.reason).join('\n'),
    ).toContain('"dist/augment.d.ts"');
  });

  it('lists a name as not checked when the augmentation is reached through another declaration file', async () => {
    write('dist/augment.d.ts', AUGMENT);
    write(
      'dist/types.d.ts',
      "import './augment.js';\nexport type AcmeTone = 'a';\n",
    );
    write(
      'dist/widget.d.ts',
      "import type {AcmeTone} from './types.js';\ndeclare const AcmeWidget: (t: AcmeTone) => null;\nexport {AcmeWidget};\n",
    );
    write('templates/account-card.tsx', template('AcmeWidget, AcmeWidgetSize'));
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(
      result.data.publicImports?.unchecked.map(u => u.reason).join('\n'),
    ).toContain('"dist/augment.d.ts"');
  });

  it('lists a name as not checked when TypeScript source augments the module it exports', async () => {
    pkg(p => {
      p.exports['./widget'] = './src/widget.ts';
    });
    write(
      'src/widget.ts',
      "import './augment.js';\nexport const AcmeWidget = () => null;\n",
    );
    write(
      'src/augment.ts',
      "declare module './widget.js' {\n  export interface AcmeWidgetSize {\n    value: string;\n  }\n}\nexport {};\n",
    );
    write('templates/account-card.tsx', template('AcmeWidget, AcmeWidgetSize'));
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(
      result.data.publicImports?.unchecked.map(u => u.reason).join('\n'),
    ).toContain('"src/augment.ts"');
  });

  it('reads a `.ts` file with an angle-bracket assertion for its augmentation', async () => {
    write(
      'src/augment.ts',
      "declare const value: unknown;\nconst s = <string>value;\ndeclare module './widget.js' {\n  interface AcmeWidgetSize {}\n}\nexport {s};\n",
    );
    write('dist/widget.d.ts', LISTED);
    write('templates/account-card.tsx', template('AcmeWidget, AcmeWidgetSize'));
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(result.data.publicImports?.unchecked).toEqual([
      expect.objectContaining({
        specifier: '@acme/widgets/widget',
        reason: expect.stringContaining('"src/augment.ts"'),
      }),
    ]);
  });

  it('counts a file with `declare module` that does not parse as augmenting', async () => {
    write(
      'src/augment.ts',
      "declare module './widget.js' {\n  interface AcmeWidgetSize {\n",
    );
    write('dist/widget.d.ts', LISTED);
    write('templates/account-card.tsx', template('AcmeWidget, AcmeWidgetSize'));
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(
      result.data.publicImports?.unchecked.map(u => u.reason).join('\n'),
    ).toContain('"src/augment.ts"');
  });

  it('leaves a declaration file with no import or export (a global script) unchecked', async () => {
    write(
      'dist/widget.d.ts',
      'interface AcmeWidgetProps {\n  label: string;\n}\ndeclare const AcmeWidget: (p: AcmeWidgetProps) => null;\n',
    );
    write(
      'templates/account-card.tsx',
      template('AcmeWidget, AcmeWidgetProps'),
    );
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(await codes()).toEqual([]);
    expect(result.data.publicImports?.unchecked.map(u => u.specifier)).toEqual([
      '@acme/widgets/widget',
    ]);
  });
});

describe('declaration files: default exports', () => {
  const template = (/** @type {string} */ names) =>
    `import {${names}} from '@acme/widgets/widget';\nexport default function C() {\n  return <div />;\n}\n`;
  const HEAD =
    'interface AcmeWidgetProps {\n  label: string;\n}\nexport declare const AcmeWidget: (p: AcmeWidgetProps) => null;\n';

  beforeEach(() => {
    pkg(p => {
      p.exports['./widget'] = './dist/widget.js';
    });
    write('dist/widget.js', 'export const AcmeWidget = () => null;\n');
    write(
      'templates/account-card.tsx',
      template('AcmeWidget, AcmeWidgetProps'),
    );
  });

  for (const [form, tail] of [
    ['export default function', 'export default function f(): void;\n'],
    ['export default class', 'export default class K {}\n'],
    ['export default interface', 'export default interface I {\n  a: 1;\n}\n'],
  ]) {
    it(`keeps implicit exports after ${form}`, async () => {
      write('dist/widget.d.ts', HEAD + tail);
      expect(await codes()).toEqual([]);
    });
  }

  for (const [form, tail] of [
    [
      'export default <expression>',
      'declare const d: number;\nexport default d;\n',
    ],
    ['export {} list', 'export {};\n'],
    ['export … from', "export {X} from './x';\n"],
    ['export *', "export * from './x';\n"],
  ]) {
    it(`ends implicit exports at ${form}`, async () => {
      write('dist/widget.d.ts', HEAD + tail);
      write('dist/x.d.ts', 'export declare const X: number;\n');
      expect(await codes()).toEqual(['template_import_missing_name']);
    });
  }
});

describe('the default-export fix names a value', () => {
  it('prefers an exported function or class declaration', async () => {
    write(
      'templates/account-card.tsx',
      'export const ACCOUNT_LIMIT = 3;\nexport const Size = "sm";\nexport class AccountCard {}\n',
    );
    const [issue] = await found();
    expect(issue?.message).toContain('export default AccountCard;');
  });

  it('skips ALL-CAPS names and falls back to the generic fix with none left', async () => {
    write(
      'templates/account-card.tsx',
      'export const ACCOUNT_LIMIT = 3;\nexport const API = 1;\n',
    );
    const [issue] = await found();
    expect(issue?.message).not.toContain('export default ACCOUNT_LIMIT');
    expect(issue?.message).toContain('`export default function …`');
  });

  it('names no hook, helper or type-only name, and falls back to the generic fix', async () => {
    write(
      'templates/account-card.tsx',
      'export function useAccount() {\n  return null;\n}\nexport function formatBalance(n: number) {\n  return String(n);\n}\nexport const ACCOUNT_LIMIT = 3;\nexport type AccountCardProps = {title: string};\nexport interface AccountCardSize {\n  value: string;\n}\n',
    );
    const [issue] = await found();
    expect(issue?.code).toBe('template_no_default_export');
    expect(issue?.message).not.toContain('export default useAccount;');
    expect(issue?.message).not.toContain('formatBalance');
    expect(issue?.message).not.toContain('export default AccountCard');
    expect(issue?.message).toContain('`export default function …`');
  });

  it('suggests a PascalCase const when no function or class fits', async () => {
    write(
      'templates/account-card.tsx',
      'export function useAccount() {\n  return null;\n}\nexport const AccountCard = () => null;\n',
    );
    const [issue] = await found();
    expect(issue?.message).toContain('export default AccountCard;');
  });

  it('names no public import when package.json has no name', async () => {
    pkg(p => delete p.name);
    write(
      'templates/account-card.tsx',
      'export function AccountCard() {\n  return null;\n}\n',
    );
    const result = await validateLocalIntegration(dir);
    const note = (result.notes ?? []).find(
      n => n.code === 'template_no_default_export',
    );
    expect(note?.message).toContain(
      'anything that renders the template gets nothing',
    );
    expect(note?.message).not.toContain('null/');
  });
});

describe('a doc name that differs from its file name', () => {
  it('leaves the export-name judgment to the doc-name check', async () => {
    write(
      'components/AcmeWidget.doc.mjs',
      "export default {type: 'component', name: 'AcmeWidgets', import: '@acme/widgets/components/AcmeWidget', usage: {description: 'A widget.'}, props: []};\n",
    );
    write(
      'components/AcmeWidget.tsx',
      "export {AcmeWidgets} from '@acme/ui';\n",
    );
    const result = await validateIntegration(undefined, {cwd: dir});
    expect(
      (await codes()).filter(code => code === 'component_import_missing_name'),
    ).toEqual([]);
    expect(
      (result.data.publicImports?.unchecked ?? []).filter(
        u => u.file === 'components/AcmeWidget.doc.mjs',
      ),
    ).toEqual([]);
  });
});
