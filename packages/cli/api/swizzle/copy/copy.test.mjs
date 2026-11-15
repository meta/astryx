// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Colocated tests for the swizzle.copy leaf — path-safety + overwrite.
 * The copy leaf writes files, so the output base AND the component name (which
 * becomes a path segment) must both be confined to cwd.
 */

import {describe, it, expect, afterEach, beforeEach, vi} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {fileURLToPath} from 'node:url';
import ts from 'typescript';
import {swizzle} from '../swizzle.mjs';

/** Set by a test to make the gh lookup throw an error it does not expect. */
let ghLookupFails = false;
vi.mock('../_adapter.mjs', async importOriginal => {
  const actual = await importOriginal();
  return {
    ...actual,
    checkGhCli: (...args) => {
      if (ghLookupFails) {
        throw new TypeError('the gh lookup failed');
      }
      return actual.checkGhCli(...args);
    },
  };
});

// api/swizzle/copy/ -> up 5 = repo root.
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../../..');
const OUT = 'tmp-swizzle-copy-test';
const SLOW = 30_000;

describe('swizzle.copy — destination symlinks (spec:AST-017 FR1, FR5)', () => {
  let fixture;
  afterEach(() => {
    if (fixture) fs.rmSync(fixture, {recursive: true, force: true});
  });

  it.each([
    ['out', false],
    ['out/Table', false],
    ['out/Table/plugins', false],
    ['out/Table/plugins/nested.ts', false],
    ['out/Table/plugins/nested.ts', true],
  ])('refuses %s (dangling: %s) linked outside the project before writing, with or without overwrite', async (linkPath, dangling) => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-symlink-'));
    const cwd = path.join(fixture, 'project');
    const source = path.join(cwd, 'node_modules/@astryxdesign/core/src/Table');
    fs.mkdirSync(path.join(source, 'plugins'), {recursive: true});
    // Table imports the nested file, so the copy writes it too.
    fs.writeFileSync(
      path.join(source, 'Table.tsx'),
      "import {nested} from './plugins/nested';\nexport const Table = nested;",
    );
    fs.writeFileSync(path.join(source, 'plugins/nested.ts'), 'export const nested = 1;');
    fs.writeFileSync(path.join(cwd, 'package.json'), '{"name":"consumer"}');
    fs.writeFileSync(
      path.join(cwd, 'node_modules/@astryxdesign/core/package.json'),
      '{"name":"@astryxdesign/core","version":"0.0.0"}',
    );
    const outside = path.join(fixture, 'outside');
    fs.mkdirSync(outside);
    const target = linkPath.endsWith('.ts') ? path.join(outside, 'target.ts') : outside;
    if (target !== outside && !dangling) fs.writeFileSync(target, '// consumer edit');
    const link = path.join(cwd, linkPath);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(target, link);

    for (const overwrite of [false, true]) {
      await expect(swizzle('Table', {cwd, output: './out', overwrite})).rejects.toMatchObject({
        code: 'ERR_PATH_TRAVERSAL',
      });
      expect(fs.existsSync(path.join(cwd, 'out/Table/Table.tsx'))).toBe(false);
      expect(fs.readdirSync(outside)).toEqual(target !== outside && !dangling ? ['target.ts'] : []);
      if (target !== outside && !dangling) expect(fs.readFileSync(target, 'utf8')).toBe('// consumer edit');
    }
  });

  it('writes through a folder linked elsewhere inside the project, nested folders included', async () => {
    fixture = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-symlink-'));
    const source = path.join(fixture, 'node_modules/@astryxdesign/core/src/Table');
    fs.mkdirSync(path.join(source, 'plugins'), {recursive: true});
    // Table imports the nested file, so the copy writes it too.
    fs.writeFileSync(
      path.join(source, 'Table.tsx'),
      "import {nested} from './plugins/nested';\nexport const Table = nested;",
    );
    fs.writeFileSync(path.join(source, 'plugins/nested.ts'), 'export const nested = 1;');
    fs.writeFileSync(path.join(fixture, 'package.json'), '{"name":"consumer"}');
    fs.writeFileSync(
      path.join(fixture, 'node_modules/@astryxdesign/core/package.json'),
      '{"name":"@astryxdesign/core","version":"0.0.0"}',
    );
    // `components` -> `src/components`, a common project layout.
    fs.mkdirSync(path.join(fixture, 'src/components'), {recursive: true});
    fs.symlinkSync(path.join(fixture, 'src/components'), path.join(fixture, 'components'));

    const r = await swizzle('Table', {cwd: fixture, output: './components'});
    expect(r.data.files).toEqual(['Table.tsx', 'plugins/nested.ts']);
    expect(
      fs.readFileSync(path.join(fixture, 'src/components/Table/plugins/nested.ts'), 'utf8'),
    ).toBe('export const nested = 1;');
  });
});

describe('swizzle.copy — path safety', () => {
  afterEach(() => {
    fs.rmSync(path.join(REPO, OUT), {recursive: true, force: true});
    // guard against an escape landing at <repo>/src
    if (fs.existsSync(path.join(REPO, 'src'))) {
      // never auto-delete a real src; the test asserts it wasn't created.
    }
  });

  it('rejects a component name that traverses out of the output base', async () => {
    await expect(
      swizzle('../src', {cwd: REPO, output: './' + OUT}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
  }, SLOW);

  it('rejects a component name containing a path separator', async () => {
    await expect(
      swizzle('foo/bar', {cwd: REPO, output: './' + OUT}),
    ).rejects.toMatchObject({code: 'ERR_PATH_TRAVERSAL'});
  }, SLOW);

  it('rejects an --output that escapes cwd (relative and absolute)', async () => {
    await expect(swizzle('Button', {cwd: REPO, output: '../evil'})).rejects.toMatchObject({
      code: 'ERR_PATH_TRAVERSAL',
    });
    await expect(swizzle('Button', {cwd: REPO, output: '/tmp/evil'})).rejects.toMatchObject({
      code: 'ERR_PATH_TRAVERSAL',
    });
  }, SLOW);

  it('copies a real component, then refuses to clobber without overwrite', async () => {
    const r = await swizzle('Button', {cwd: REPO, output: './' + OUT});
    expect(r.type).toBe('swizzle.copy');
    expect(r.data.filesCopied).toBeGreaterThan(0);
    await expect(swizzle('Button', {cwd: REPO, output: './' + OUT})).rejects.toMatchObject({
      code: 'ERR_FILE_EXISTS',
    });
    const r2 = await swizzle('Button', {cwd: REPO, output: './' + OUT, overwrite: true});
    expect(r2.data.filesCopied).toBe(r.data.filesCopied);
  }, SLOW);
});

describe('swizzle.copy — the gh feedback line', () => {
  afterEach(() => {
    ghLookupFails = false;
    fs.rmSync(path.join(REPO, OUT), {recursive: true, force: true});
  });

  it(
    'returns its receipt, without the gh line, when the only gh on PATH is a symlink loop',
    async () => {
      const bin = fs.mkdtempSync(
        path.join(os.tmpdir(), 'astryx-swizzle-gh-loop-'),
      );
      fs.symlinkSync('gh', path.join(bin, 'gh'));
      const original = process.env.PATH;
      process.env.PATH = bin;
      try {
        const r = await swizzle('Button', {cwd: REPO, output: './' + OUT});
        expect(r.type).toBe('swizzle.copy');
        expect(r.data.filesCopied).toBeGreaterThan(0);
        expect(r.data.feedback?.ghCommand).toBeUndefined();
      } finally {
        process.env.PATH = original;
        fs.rmSync(bin, {recursive: true, force: true});
      }
    },
    SLOW,
  );

  it(
    'fails before writing anything when the gh lookup throws',
    async () => {
      ghLookupFails = true;
      await expect(
        swizzle('Button', {cwd: REPO, output: './' + OUT}),
      ).rejects.toThrow(/the gh lookup failed/);
      expect(fs.existsSync(path.join(REPO, OUT))).toBe(false);
    },
    SLOW,
  );

  it(
    'offers the gh command when gh is on PATH, without running gh',
    async () => {
      // A gh that records each run: a swizzle must not wait on it.
      const bin = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-gh-'));
      const ran = path.join(bin, 'ran');
      fs.writeFileSync(
        path.join(bin, 'gh'),
        `#!/bin/sh\necho run >> ${JSON.stringify(ran)}\nexit 0\n`,
      );
      fs.chmodSync(path.join(bin, 'gh'), 0o755);
      const original = process.env.PATH;
      process.env.PATH = [bin, original].join(path.delimiter);
      try {
        const r = await swizzle('Button', {cwd: REPO, output: './' + OUT});
        expect(r.data.feedback?.ghCommand).toMatch(/^gh issue create --repo /);
        expect(fs.existsSync(ran)).toBe(false);
      } finally {
        process.env.PATH = original;
        fs.rmSync(bin, {recursive: true, force: true});
      }
    },
    SLOW,
  );
});

describe('swizzle.copy — private attribute owner modules (spec:AST-110 FR4)', () => {
  const OWNER_OUT = 'tmp-swizzle-owner-test';
  const out = () => path.join(REPO, OWNER_OUT);
  const exportKeys = () =>
    new Set(
      Object.keys(
        JSON.parse(
          fs.readFileSync(
            path.join(REPO, 'packages/core/package.json'),
            'utf-8',
          ),
        ).exports,
      ),
    );
  /** Every `@astryxdesign/core/*` import in a file. */
  const coreImportsOf = file =>
    [
      ...fs
        .readFileSync(file, 'utf-8')
        .matchAll(/from ['"](@astryxdesign\/core\/[^'"]+)['"]/g),
    ].map(m => m[1]);
  /** A module's source with every import specifier blanked. */
  const withoutSpecifiers = content =>
    content.replace(/(from\s+['"])[^'"]+(['"])/g, '$1$2');

  afterEach(() => {
    fs.rmSync(out(), {recursive: true, force: true});
  });

  it(
    'copies the owner module a component imports, and its unexported style module, beside it',
    async () => {
      const r = await swizzle('Item', {cwd: REPO, output: './' + OWNER_OUT});
      expect(r.type).toBe('swizzle.copy');
      expect(r.data.files).toEqual(
        expect.arrayContaining([
          '../privateAttributes/press.stylex.ts',
          '../motion/reducedMotion.stylex.ts',
        ]),
      );
      expect(r.data.filesCopied).toBe(r.data.files.length);
      // The component's import of the owner module stays relative.
      expect(
        fs.readFileSync(path.join(out(), 'Item/Item.tsx'), 'utf-8'),
      ).toContain("from '../privateAttributes/press.stylex'");
      // The owner module keeps its relative import of the unexported module,
      // and every package import in any copied file resolves.
      const owner = path.join(out(), 'privateAttributes/press.stylex.ts');
      expect(fs.readFileSync(owner, 'utf-8')).toContain(
        "from '../motion/reducedMotion.stylex'",
      );
      const keys = exportKeys();
      for (const file of [
        ...fs
          .readdirSync(path.join(out(), 'Item'))
          .map(f => path.join(out(), 'Item', f)),
        owner,
        path.join(out(), 'motion/reducedMotion.stylex.ts'),
      ]) {
        for (const specifier of coreImportsOf(file)) {
          expect(
            keys.has('./' + specifier.replace('@astryxdesign/core/', '')),
            specifier,
          ).toBe(true);
        }
      }
      // Whole and unedited, except import specifiers.
      expect(withoutSpecifiers(fs.readFileSync(owner, 'utf-8'))).toBe(
        withoutSpecifiers(
          fs.readFileSync(
            path.join(
              REPO,
              'packages/core/src/privateAttributes/press.stylex.ts',
            ),
            'utf-8',
          ),
        ),
      );
    },
    SLOW,
  );

  it(
    'reuses an identical copy for a second component, and refuses a changed one without --overwrite',
    async () => {
      await swizzle('Item', {cwd: REPO, output: './' + OWNER_OUT});
      const second = await swizzle('CheckboxList', {
        cwd: REPO,
        output: './' + OWNER_OUT,
      });
      // The identical owner module is part of the second copy too.
      expect(second.data.files).toContain('../privateAttributes/press.stylex.ts');
      expect(second.data.filesCopied).toBe(second.data.files.length);

      const owner = path.join(out(), 'privateAttributes/press.stylex.ts');
      const copied = fs.readFileSync(owner, 'utf-8');
      fs.writeFileSync(owner, copied + '\n// edited\n');
      fs.rmSync(path.join(out(), 'CheckboxList'), {
        recursive: true,
        force: true,
      });
      await expect(
        swizzle('CheckboxList', {cwd: REPO, output: './' + OWNER_OUT}),
      ).rejects.toMatchObject({code: 'ERR_FILE_EXISTS'});
      // The refusal wrote nothing.
      expect(fs.existsSync(path.join(out(), 'CheckboxList'))).toBe(false);
      expect(fs.readFileSync(owner, 'utf-8')).toBe(copied + '\n// edited\n');

      await swizzle('CheckboxList', {
        cwd: REPO,
        output: './' + OWNER_OUT,
        overwrite: true,
      });
      expect(fs.readFileSync(owner, 'utf-8')).toBe(copied);
    },
    SLOW,
  );

  it(
    'a failed shared-module write leaves no folder it created behind',
    async () => {
      // A folder where the owner module goes makes its write fail.
      const blocked = path.join(out(), 'privateAttributes/press.stylex.ts');
      fs.mkdirSync(blocked, {recursive: true});
      await expect(
        swizzle('Item', {cwd: REPO, output: './' + OWNER_OUT, overwrite: true}),
      ).rejects.toMatchObject({code: 'ERR_WRITE_FAILED'});
      expect(fs.existsSync(path.join(out(), 'Item'))).toBe(false);
      expect(fs.existsSync(path.join(out(), 'motion'))).toBe(false);
      // The folder that was there before the run stays.
      expect(fs.existsSync(blocked)).toBe(true);
    },
    SLOW,
  );
});

describe('swizzle.copy — browser test harnesses', () => {
  afterEach(() => {
    fs.rmSync(path.join(REPO, OUT), {recursive: true, force: true});
  });

  it('leaves out a component folder\'s *.spec.ts harnesses, which import dev-only packages', async () => {
    const harness = path.join(
      REPO,
      'packages/core/src/Item/ItemMarkerColumns.a11y.chromium.spec.ts',
    );
    expect(fs.existsSync(harness)).toBe(true);
    const r = await swizzle('Item', {cwd: REPO, output: './' + OUT});
    expect(r.data.files.filter(f => /\.spec\.[cm]?[jt]sx?$/.test(f))).toEqual([]);
    expect(
      fs.existsSync(
        path.join(REPO, OUT, 'Item', 'ItemMarkerColumns.a11y.chromium.spec.ts'),
      ),
    ).toBe(false);
    // The component's own source still comes along.
    expect(r.data.files).toContain('Item.tsx');
  }, SLOW);
});

describe('swizzle.copy — the module graph (spec:AST-110 FR1, FR2)', () => {
  const GRAPH_OUT = 'tmp-swizzle-graph-test';
  const out = () => path.join(REPO, GRAPH_OUT);
  const CORE = path.join(REPO, 'packages/core');
  /** Every file under a folder, as paths relative to it. */
  const filesUnder = dir =>
    fs
      .readdirSync(dir, {recursive: true, withFileTypes: true})
      .filter(e => e.isFile())
      .map(e => path.relative(dir, path.join(e.parentPath, e.name)));
  /** Every `from '...'` and `import('...')` specifier in a file. */
  const importsOf = file =>
    [
      ...fs
        .readFileSync(file, 'utf-8')
        .matchAll(/(?:from\s+|import\(\s*)['"]([^'"]+)['"]/g),
    ].map(m => ({specifier: m[1]}));
  /**
   * Diagnostics TypeScript reports for the copied files when it resolves
   * `@astryxdesign/core` the way a product does: through the package's
   * `exports`. Only unresolved modules and missing exports count here.
   */
  const unresolvedImportsIn = files => {
    // The product installs Core; the copy resolves it from its own folder.
    const link = path.join(out(), 'node_modules/@astryxdesign/core');
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(CORE, link, 'dir');
    const program = ts.createProgram(files, {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      moduleResolution: ts.ModuleResolutionKind.Bundler,
      customConditions: ['source'],
      jsx: ts.JsxEmit.ReactJSX,
      strict: true,
      skipLibCheck: true,
      noEmit: true,
      resolveJsonModule: true,
    });
    const RESOLUTION = new Set([2305, 2307, 2614, 2724, 1192]);
    const productInstalls = [
      'react',
      '@stylexjs/stylex',
      ...Object.keys(
        JSON.parse(fs.readFileSync(path.join(CORE, 'package.json'), 'utf-8'))
          .dependencies ?? {},
      ),
    ];
    return files.flatMap(file =>
      program
        .getSemanticDiagnostics(program.getSourceFile(file))
        .filter(d => RESOLUTION.has(d.code))
        // The product installs React, StyleX and Core's own dependencies.
        .filter(d => !productInstalls.some(name => ts.flattenDiagnosticMessageText(d.messageText, ' ').includes(`'${name}'`) || ts.flattenDiagnosticMessageText(d.messageText, ' ').includes(`'${name}/`)))
        .map(d => `${path.relative(out(), file)}: TS${d.code} ${ts.flattenDiagnosticMessageText(d.messageText, ' ')}`),
    );
  };

  afterEach(() => {
    fs.rmSync(out(), {recursive: true, force: true});
  });

  it(
    'copies the internal helpers a component reaches, and imports public names from public paths',
    async () => {
      const r = await swizzle('Button', {cwd: REPO, output: './' + GRAPH_OUT});
      await swizzle('Dialog', {cwd: REPO, output: './' + GRAPH_OUT});
      // InputGroupInternalContext is not exported, so the copy carries it.
      expect(r.data.files).toContain(
        '../InputGroup/InputGroupInternalContext.ts',
      );
      expect(r.data.filesCopied).toBe(r.data.files.length);
      expect(r.data.files).not.toContain('../i18n/InternationalizationContext.ts');
      const files = filesUnder(out())
        .filter(rel => /\.tsx?$/.test(rel) && !rel.startsWith('node_modules'))
        .map(rel => path.join(out(), rel));
      for (const file of files) {
        for (const {specifier} of importsOf(file)) {
          expect(specifier, path.relative(out(), file)).not.toMatch(/^@astryxdesign\/core\/internal/);
          if (specifier.startsWith('.')) {
            expect(
              path.resolve(path.dirname(file), specifier).startsWith(out()),
              `${specifier} in ${path.relative(out(), file)} stays in the output`,
            ).toBe(true);
          }
        }
      }
      expect(unresolvedImportsIn(files)).toEqual([]);
    },
    SLOW,
  );

  it(
    'imports a StyleX module by its own exported path',
    async () => {
      await swizzle('Button', {cwd: REPO, output: './' + GRAPH_OUT});
      const source = fs.readFileSync(path.join(out(), 'Button/Button.tsx'), 'utf-8');
      expect(source).toContain("from '@astryxdesign/core/theme/tokens.stylex'");
      expect(source).not.toMatch(/from '@astryxdesign\/core\/theme'/);
    },
    SLOW,
  );

  it(
    'copies the nested folders a component imports',
    async () => {
      const r = await swizzle('Table', {cwd: REPO, output: './' + GRAPH_OUT});
      expect(r.data.files).toEqual(
        expect.arrayContaining([
          expect.stringMatching(/^plugins\/sortable\//),
          expect.stringMatching(/^plugins\/selection\//),
        ]),
      );
    },
    SLOW,
  );

  it(
    'holds only source the component runs',
    async () => {
      for (const name of ['Badge', 'Field']) {
        await swizzle(name, {cwd: REPO, output: './' + GRAPH_OUT});
      }
      const files = filesUnder(out());
      expect(files.length).toBeGreaterThan(0);
      for (const file of files) {
        expect(file).not.toMatch(
          /\.(?:test|spec|stories|story|doc|bench)\.|test-violations|render-testing|__tests__|__fixtures__|\.md$/,
        );
      }
    },
    SLOW,
  );

  it(
    'reuses an identical helper, and never overwrites a different one',
    async () => {
      await swizzle('Button', {cwd: REPO, output: './' + GRAPH_OUT});
      const helper = path.join(out(), 'InputGroup/groupStyles.ts');
      const original = fs.readFileSync(helper, 'utf-8');

      // An identical helper is part of the next copy, unwritten.
      const second = await swizzle('TextInput', {cwd: REPO, output: './' + GRAPH_OUT});
      expect(second.data.files).toContain('../InputGroup/groupStyles.ts');

      // A changed helper stays as the product left it, even with --overwrite.
      fs.writeFileSync(helper, original + '\n// edited\n');
      const third = await swizzle('Button', {
        cwd: REPO,
        output: './' + GRAPH_OUT,
        overwrite: true,
      });
      expect(fs.readFileSync(helper, 'utf-8')).toBe(original + '\n// edited\n');
      const version = JSON.parse(
        fs.readFileSync(path.join(CORE, 'package.json'), 'utf-8'),
      ).version;
      const suffixed = `../InputGroup/groupStyles.v${version}.ts`;
      expect(third.data.files).toContain(suffixed);
      expect(fs.readFileSync(path.join(out(), 'Button', suffixed), 'utf-8')).toBe(original);
      // Only the new copy points at the suffixed helper.
      expect(
        fs.readFileSync(path.join(out(), 'Button/Button.tsx'), 'utf-8'),
      ).toContain(`from '../InputGroup/groupStyles.v${version}'`);
      expect(
        fs.readFileSync(path.join(out(), 'TextInput/TextInput.tsx'), 'utf-8'),
      ).not.toContain(`groupStyles.v${version}`);
    },
    SLOW,
  );
});

describe('swizzle.copy — helpers an earlier swizzle wrote (spec:AST-110 FR2)', () => {
  /** @type {string} */
  let project;
  const VERSION = '1.0.0';
  /** A fake Core whose components share a helper that imports another. */
  const buildCore = () => {
    const src = path.join(project, 'node_modules/@astryxdesign/core/src');
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(src, rel)), {recursive: true});
      fs.writeFileSync(path.join(src, rel), text);
    };
    write('utils/h.ts', 'export const h = 1;\n');
    fs.writeFileSync(
      path.join(src, '../package.json'),
      JSON.stringify({name: '@astryxdesign/core', version: VERSION}),
    );
    write('utils/a.ts', "import {h} from './h';\nexport const a = h;\n");
    for (const name of ['Button', 'Card', 'Dialog']) {
      write(
        `${name}/${name}.tsx`,
        `import {a} from '../utils/a';\nexport const ${name} = () => a;\n`,
      );
      write(`${name}/index.ts`, `export {${name}} from './${name}';\n`);
    }
  };
  const out = rel => path.join(project, 'components/astryx', rel);
  const read = rel => fs.readFileSync(out(rel), 'utf-8');

  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-helpers-'));
    fs.writeFileSync(
      path.join(project, 'package.json'),
      JSON.stringify({name: 'consumer', version: '1.0.0'}),
    );
    buildCore();
  });
  afterEach(() => {
    fs.rmSync(project, {recursive: true, force: true});
  });

  it(
    'never rewrites a version-suffixed helper an earlier copy imports',
    async () => {
      await swizzle('Button', {cwd: project});
      fs.appendFileSync(out('utils/a.ts'), '// edited by the product\n');
      fs.appendFileSync(out('utils/h.ts'), '// edited by the product\n');

      // The edited helpers stay; Card gets its own.
      await swizzle('Card', {cwd: project});
      expect(read('Card/Card.tsx')).toContain(`from '../utils/a.v${VERSION}'`);
      const cardHelper = read(`utils/a.v${VERSION}.ts`);
      expect(cardHelper).toContain(`from './h.v${VERSION}'`);
      fs.appendFileSync(out(`utils/h.v${VERSION}.ts`), '// edited again\n');

      const dialog = await swizzle('Dialog', {cwd: project});
      // Card's copy is untouched: its helper still imports its own h.
      expect(read(`utils/a.v${VERSION}.ts`)).toBe(cardHelper);
      expect(read(`utils/h.v${VERSION}.ts`)).toContain('// edited again');
      expect(read('utils/h.ts')).toContain('// edited by the product');
      // Dialog points at helpers of its own.
      expect(dialog.data.files).toEqual(
        expect.arrayContaining([
          `../utils/a.v${VERSION}-2.ts`,
          `../utils/h.v${VERSION}-2.ts`,
        ]),
      );
      expect(read(`utils/a.v${VERSION}-2.ts`)).toContain(
        `from './h.v${VERSION}-2'`,
      );
      expect(read('Dialog/Dialog.tsx')).toContain(
        `from '../utils/a.v${VERSION}-2'`,
      );
    },
    SLOW,
  );
});

describe('swizzle.copy — the npm packages a copy imports (spec:AST-110 FR1)', () => {
  /** @type {string} */
  let project;
  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-deps-'));
    fs.writeFileSync(path.join(project, 'package.json'), JSON.stringify({name: 'consumer', version: '1.0.0'}));
    const core = path.join(project, 'node_modules/@astryxdesign/core');
    fs.mkdirSync(path.join(core, 'src/Chart'), {recursive: true});
    fs.writeFileSync(
      path.join(core, 'package.json'),
      JSON.stringify({
        name: '@astryxdesign/core',
        version: '1.0.0',
        dependencies: {'d3-scale': '^4.0.2'},
        peerDependencies: {react: '^19.0.0'},
      }),
    );
    fs.writeFileSync(path.join(core, 'src/Chart/index.ts'), "export {Chart} from './Chart';\n");
    fs.writeFileSync(
      path.join(core, 'src/Chart/Chart.tsx'),
      [
        "import {scaleLinear} from 'd3-scale';",
        "import type {ReactNode} from 'react';",
        "import {readFileSync} from 'node:fs';",
        "import {join} from 'path';",
        "import {undeclared} from '@acme/undeclared/sub';",
        'export const Chart = (): ReactNode => [scaleLinear, readFileSync, join, undeclared] && null;',
        '',
      ].join('\n'),
    );
  });
  afterEach(() => {
    fs.rmSync(project, {recursive: true, force: true});
  });

  it('reports each package with the range the owner declares, and never Node built-ins', async () => {
    const r = await swizzle('Chart', {cwd: project});
    expect(r.data.dependencies).toEqual({
      '@acme/undeclared': '*',
      'd3-scale': '^4.0.2',
      react: '^19.0.0',
    });
  });
});

describe('swizzle.copy — a name the package exports only as a type (spec:AST-110 FR1)', () => {
  /** @type {string} */
  let project;
  beforeEach(() => {
    project = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-swizzle-kinds-'));
    fs.writeFileSync(
      path.join(project, 'package.json'),
      JSON.stringify({name: 'consumer', version: '1.0.0'}),
    );
    const core = path.join(project, 'node_modules/@astryxdesign/core');
    const write = (rel, text) => {
      fs.mkdirSync(path.dirname(path.join(core, rel)), {recursive: true});
      fs.writeFileSync(path.join(core, rel), text);
    };
    write(
      'package.json',
      JSON.stringify({
        name: '@astryxdesign/core',
        version: '1.0.0',
        exports: {'.': {source: './src/index.ts', default: './dist/index.js'}},
      }),
    );
    write('src/utils/shape.ts', "export const shape = 'round';\n");
    write('src/utils/size.ts', 'export const size = 1;\n');
    // The package root re-exports `shape` as a type only, `size` as a value.
    write(
      'src/index.ts',
      [
        "export type {shape} from './utils/shape';",
        "export {size} from './utils/size';",
        "export {Button} from './Button/Button';",
        '',
      ].join('\n'),
    );
    write(
      'src/Button/Button.tsx',
      [
        "import {shape} from '../utils/shape';",
        "import {size} from '../utils/size';",
        'export const Button = () => `${shape} ${size}`;',
        '',
      ].join('\n'),
    );
    write('src/Button/index.ts', "export {Button} from './Button';\n");
  });
  afterEach(() => {
    fs.rmSync(project, {recursive: true, force: true});
  });

  it(
    'carries a value the package exports only as a type, and imports a value export from the package',
    async () => {
      const r = await swizzle('Button', {cwd: project});
      const source = fs.readFileSync(
        path.join(project, 'components/astryx/Button/Button.tsx'),
        'utf-8',
      );
      // A type-only export is erased at runtime, so the copy carries `shape`.
      expect(source).toContain("from '../utils/shape'");
      expect(r.data.files).toContain('../utils/shape.ts');
      expect(source).toContain("import {size} from '@astryxdesign/core';");
      expect(r.data.files).not.toContain('../utils/size.ts');
    },
    SLOW,
  );
});
