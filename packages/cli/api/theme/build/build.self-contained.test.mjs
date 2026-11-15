// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A built theme module loads in any bundler and in plain Node: the
 * theme's local TypeScript or JSX modules it carries by import are compiled
 * to JavaScript beside the build, every local import names its file, and a
 * package's check names a built module that still imports TypeScript source.
 */

import {
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {spawnSync} from 'node:child_process';
import * as fs from 'node:fs';
import {createRequire} from 'node:module';
import * as os from 'node:os';
import * as path from 'node:path';
import {logger} from '../../logger.mjs';
import {themeBuild, themeBuildFamily, themeSourceFiles} from './build.mjs';
import {ensureCoreBuilt} from '../../../clients/cli/commands/ensure-core-built.mjs';
import {
  filesOnDisk,
  shippedImportFindings,
} from '../../../foundation/integrations/shipped-imports.mjs';

vi.setConfig({testTimeout: 120_000});

const CLI_ROOT = path.resolve(import.meta.dirname, '../../..');
const require = createRequire(import.meta.url);
const FIXTURE_LINKS = {
  '@astryxdesign': path.join(CLI_ROOT, 'node_modules/@astryxdesign'),
  react: path.dirname(require.resolve('react/package.json')),
};

/** @type {string} */
let dir;
beforeAll(() => ensureCoreBuilt(), 200_000);
beforeEach(() => {
  dir = fs.realpathSync(
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-self-contained-')),
  );
  fs.writeFileSync(
    path.join(dir, 'package.json'),
    '{"name":"app","type":"module"}\n',
  );
  for (const [name, target] of Object.entries(FIXTURE_LINKS)) {
    const link = path.join(dir, 'node_modules', name);
    fs.mkdirSync(path.dirname(link), {recursive: true});
    fs.symlinkSync(target, link, 'dir');
  }
});
afterEach(() => {
  fs.rmSync(dir, {recursive: true, force: true});
});

/** @param {string} rel @param {string} text */
const write = (rel, text) => {
  fs.mkdirSync(path.dirname(path.join(dir, rel)), {recursive: true});
  fs.writeFileSync(path.join(dir, rel), text);
};
/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(dir, rel), 'utf8');
/** @param {string} rel */
const exists = rel => fs.existsSync(path.join(dir, rel));

/** @param {() => Promise<unknown>} run */
async function quiet(run) {
  const silent = logger.silent;
  logger.setSilent(true);
  try {
    return /** @type {any} */ (await run());
  } finally {
    logger.setSilent(silent);
  }
}

/**
 * Import a built module in plain Node, with no TypeScript loader, and print
 * what its theme carries.
 * @param {string} rel
 */
function plainImport(rel) {
  return spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `const m = await import(${JSON.stringify(path.join(dir, rel))}); const t = Object.values(m).find(v => v && v.name); console.log(JSON.stringify({name: t.name, close: t.icons.close.type, size: t.icons.close.props.width}));`,
    ],
    {cwd: dir, encoding: 'utf8', timeout: 60_000},
  );
}

const BIN = path.join(CLI_ROOT, 'clients/cli/bin/astryx.mjs');
/** Run the CLI in its own process. @param {string[]} args */
const cli = args =>
  spawnSync(process.execPath, [BIN, ...args], {
    cwd: dir,
    encoding: 'utf8',
    timeout: 120_000,
  });

/**
 * Run a build with what it prints kept.
 * @param {() => Promise<unknown>} run
 */
async function captured(run) {
  /** @type {string[]} */
  const lines = [];
  const silent = logger.silent;
  const {warn, log, error} = logger;
  logger.setSilent(false);
  logger.warn = (/** @type {string} */ l) => lines.push(l);
  logger.log = (/** @type {string} */ l) => lines.push(l);
  logger.error = (/** @type {string} */ l) => lines.push(l);
  try {
    let result;
    let err;
    try {
      result = await run();
    } catch (e) {
      err = e;
    }
    return {
      result: /** @type {any} */ (result),
      err: /** @type {any} */ (err),
      lines,
    };
  } finally {
    Object.assign(logger, {warn, log, error});
    logger.setSilent(silent);
  }
}

const ICONS_TSX = `import * as React from 'react';\nimport {size} from './helper';\nexport const w98Icons = {close: <svg width={size} height={size} />};\n`;
const HELPER_TS = `export const size: number = 16;\n`;
const THEME = `import {defineTheme} from '@astryxdesign/core/theme';\nimport {w98Icons} from './icons';\nexport const w98Theme = defineTheme({name: 'w98', icons: w98Icons, tokens: {'--color-accent': '#000080'}});\n`;

describe('a theme whose icon registry is TypeScript with JSX', () => {
  it('builds a module that plain Node imports, with the registry compiled beside it', async () => {
    write('themes/w98/icons.tsx', ICONS_TSX);
    write('themes/w98/helper.ts', HELPER_TS);
    write('themes/w98/w98Theme.ts', THEME);
    await quiet(() => themeBuild('themes/w98/w98Theme.ts', {}, {cwd: dir}));

    const js = read('themes/w98/w98.js');
    expect(js).toContain(
      "import { w98Icons } from './w98.modules/icons.tsx.js';",
    );
    expect(js).not.toMatch(/from '\.\/icons'/);
    expect(read('themes/w98/w98.modules/icons.tsx.js')).toContain(
      'Source: themes/w98/icons.tsx',
    );
    expect(read('themes/w98/w98.modules/icons.tsx.js')).toContain(
      'from "./helper.ts.js"',
    );
    expect(read('themes/w98/w98.modules/icons.tsx.js')).toContain(
      'react/jsx-runtime',
    );
    expect(read('themes/w98/w98.modules/helper.ts.js')).not.toContain(
      ': number',
    );

    const loaded = plainImport('themes/w98/w98.js');
    expect(loaded.status, loaded.stderr).toBe(0);
    expect(JSON.parse(loaded.stdout)).toEqual({
      name: 'w98',
      close: 'svg',
      size: 16,
    });

    // The compiled modules are outputs: --check compares them, and a build
    // again replaces them.
    const checked = await quiet(() =>
      themeBuild('themes/w98/w98Theme.ts', {check: true}, {cwd: dir}),
    );
    expect(checked.data.upToDate).toBe(true);
    write('themes/w98/helper.ts', `export const size: number = 24;\n`);
    const stale = await quiet(() =>
      themeBuild('themes/w98/w98Theme.ts', {check: true}, {cwd: dir}),
    );
    expect(stale.data.upToDate).toBe(false);
    expect(stale.data.stale.map((/** @type {any} */ s) => s.path)).toContain(
      'themes/w98/w98.modules/helper.ts.js',
    );
    await quiet(() => themeBuild('themes/w98/w98Theme.ts', {}, {cwd: dir}));
    expect(JSON.parse(plainImport('themes/w98/w98.js').stdout).size).toBe(24);
  });

  it('with --out in another folder, writes the compiled modules there, and the module loads from there', async () => {
    write('themes/w98/icons.tsx', ICONS_TSX);
    write('themes/w98/helper.ts', HELPER_TS);
    write('themes/w98/w98Theme.ts', THEME);
    await quiet(() =>
      themeBuild('themes/w98/w98Theme.ts', {out: 'dist/w98.css'}, {cwd: dir}),
    );
    expect(read('dist/w98.js')).toContain("from './w98.modules/icons.tsx.js'");
    expect(exists('dist/w98.modules/icons.tsx.js')).toBe(true);
    expect(exists('dist/w98.modules/helper.ts.js')).toBe(true);
    expect(exists('themes/w98/w98.modules')).toBe(false);
    const loaded = plainImport('dist/w98.js');
    expect(loaded.status, loaded.stderr).toBe(0);
  });

  it('never writes a compiled module over a file of yours: that import stays as written, and a warning says why', async () => {
    write('themes/w98/icons.tsx', ICONS_TSX);
    write('themes/w98/helper.ts', HELPER_TS);
    write('themes/w98/w98Theme.ts', THEME);
    const mine = '// my own build of the icons\nexport const w98Icons = {};\n';
    write('themes/w98/w98.modules/icons.tsx.js', mine);
    const built = await captured(() =>
      themeBuild('themes/w98/w98Theme.ts', {}, {cwd: dir}),
    );
    expect(read('themes/w98/w98.modules/icons.tsx.js')).toBe(mine);
    expect(read('themes/w98/w98.js')).toContain("from './icons'");
    const said =
      'themes/w98/w98.modules/icons.tsx.js is a file this build did not write, so themes/w98/icons.tsx is not compiled there and the built module keeps importing that TypeScript or JSX source';
    expect(built.lines.join('\n')).toContain(said);
    expect(built.result.data.warnings.join('\n')).toContain(said);
  });
});

describe('a theme with no local module, or a plain JavaScript one', () => {
  it('writes the same four outputs, and a plain JavaScript import keeps its path with its extension', async () => {
    write(
      'themes/p/pTheme.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const pTheme = defineTheme({name: 'p', tokens: {'--color-accent': '#123456'}});\n`,
    );
    await quiet(() => themeBuild('themes/p/pTheme.ts', {}, {cwd: dir}));
    expect(fs.readdirSync(path.join(dir, 'themes/p')).sort()).toEqual([
      'p.css',
      'p.css.d.ts',
      'p.d.ts',
      'p.js',
      'pTheme.ts',
    ]);
    expect(read('themes/p/p.js')).not.toMatch(/^import /m);

    write('themes/q/icons.js', `export const qIcons = {close: 'x'};\n`);
    write(
      'themes/q/qTheme.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {qIcons} from './icons';\nexport const qTheme = defineTheme({name: 'q', icons: qIcons});\n`,
    );
    await quiet(() => themeBuild('themes/q/qTheme.ts', {}, {cwd: dir}));
    expect(read('themes/q/q.js')).toContain("from './icons.js'");
    expect(fs.readdirSync(path.join(dir, 'themes/q')).sort()).toEqual([
      'icons.js',
      'q.css',
      'q.css.d.ts',
      'q.d.ts',
      'q.js',
      'qTheme.ts',
    ]);
  });
});

describe('a theme family whose member’s registry is TypeScript', () => {
  it('compiles it beside the family outputs, and the family module imports the compiled file', async () => {
    write('fam/icons.ts', `export const calmIcons = {close: 'calm-close'};\n`);
    write(
      'fam/ocean.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const ocean = defineTheme({name: 'ocean', tokens: {'--color-accent': '#0066cc'}});\n`,
    );
    write(
      'fam/ocean-calm.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean.ts';\nimport {calmIcons} from './icons.ts';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', icons: calmIcons});\n`,
    );
    await quiet(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts'],
        {familyKey: 'ocean-family'},
        {cwd: dir},
      ),
    );
    const js = read('fam/ocean-family.js');
    expect(js).toContain('"./ocean-family.modules/icons.ts.js"');
    expect(js).not.toContain('"./icons.ts"');
    expect(read('fam/ocean-family.modules/icons.ts.js')).toContain(
      'calm-close',
    );
  });
});

describe('a family build over a file of yours at a compiled path', () => {
  it('keeps the file and the TypeScript import, and warns as a single build does', async () => {
    write('fam/icons.ts', `export const calmIcons = {close: 'calm-close'};\n`);
    write(
      'fam/ocean.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nexport const ocean = defineTheme({name: 'ocean', tokens: {'--color-accent': '#0066cc'}});\n`,
    );
    write(
      'fam/ocean-calm.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean.ts';\nimport {calmIcons} from './icons.ts';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', icons: calmIcons});\n`,
    );
    const mine = '// mine\nexport const calmIcons = {};\n';
    write('fam/ocean-family.modules/icons.ts.js', mine);
    const built = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts'],
        {familyKey: 'ocean-family'},
        {cwd: dir},
      ),
    );
    expect(read('fam/ocean-family.modules/icons.ts.js')).toBe(mine);
    const said =
      'fam/ocean-family.modules/icons.ts.js is a file this build did not write, so fam/icons.ts is not compiled there';
    expect(built.lines.join('\n')).toContain(said);
    expect(built.result.data.warnings.join('\n')).toContain(said);
  });
});

describe('a family whose members each keep ./icons.ts in their own folder', () => {
  it('compiles each to its own file, and the family module loads both', async () => {
    write(
      'fam/ocean/icons.ts',
      `export const oceanIcons = {close: 'ocean-close'};\n`,
    );
    write(
      'fam/calm/icons.ts',
      `export const calmIcons = {close: 'calm-close'};\n`,
    );
    write(
      'fam/ocean/ocean.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {oceanIcons} from './icons';\nexport const ocean = defineTheme({name: 'ocean', icons: oceanIcons, tokens: {'--color-accent': '#0066cc'}});\n`,
    );
    write(
      'fam/calm/calm.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from '../ocean/ocean';\nimport {calmIcons} from './icons';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', icons: calmIcons});\n`,
    );
    await quiet(() =>
      themeBuildFamily(
        ['fam/ocean/ocean.ts', 'fam/calm/calm.ts'],
        {familyKey: 'ocean-family'},
        {cwd: dir},
      ),
    );
    const js = read('fam/ocean/ocean-family.js');
    expect(js).toContain('"./ocean-family.modules/ocean/icons.ts.js"');
    expect(js).toContain('"./ocean-family.modules/calm/icons.ts.js"');
    expect(read('fam/ocean/ocean-family.modules/ocean/icons.ts.js')).toContain(
      'ocean-close',
    );
    expect(read('fam/ocean/ocean-family.modules/calm/icons.ts.js')).toContain(
      'calm-close',
    );
    const loaded = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(path.join(dir, 'fam/ocean/ocean-family.js'))}); console.log(m.oceanTheme.icons.close, m.oceanCalmTheme.icons.close);`,
      ],
      {cwd: dir, encoding: 'utf8', timeout: 60_000},
    );
    expect(loaded.status, loaded.stderr).toBe(0);
    expect(loaded.stdout.trim()).toBe('ocean-close calm-close');
  });
});

describe('a helper outside the theme folder', () => {
  const layout = () => {
    write('shared/size.ts', `export const size: number = 20;\n`);
    write(
      'themes/w98/icons.tsx',
      `import * as React from 'react';\nimport {size} from '../../shared/size';\nexport const w98Icons = {close: <svg width={size} height={size} />};\n`,
    );
    write('themes/w98/w98Theme.ts', THEME);
  };

  it('with --out, is compiled under the output folder at its relative place, never in the source tree', async () => {
    layout();
    await quiet(() =>
      themeBuild('themes/w98/w98Theme.ts', {out: 'dist/w98.css'}, {cwd: dir}),
    );
    // Placed as under the folder that holds the theme and the helper.
    expect(read('dist/w98.js')).toContain(
      "from './w98.modules/themes/w98/icons.tsx.js'",
    );
    expect(exists('dist/w98.modules/themes/w98/icons.tsx.js')).toBe(true);
    expect(exists('dist/w98.modules/shared/size.ts.js')).toBe(true);
    expect(exists('shared/size.ts.js')).toBe(false);
    expect(exists('themes/w98/w98.modules')).toBe(false);
    const loaded = plainImport('dist/w98.js');
    expect(loaded.status, loaded.stderr).toBe(0);
    expect(JSON.parse(loaded.stdout).size).toBe(20);
  });

  it('builds from the theme’s own folder, where the helper is outside the working directory', async () => {
    layout();
    const result = await quiet(() =>
      themeBuild('w98Theme.ts', {}, {cwd: path.join(dir, 'themes/w98')}),
    );
    expect(result?.type).toBe('theme.build');
    expect(exists('shared/size.ts.js')).toBe(false);
    expect(exists('themes/w98/w98.modules/shared/size.ts.js')).toBe(true);
    expect(exists('themes/w98/w98.modules/themes/w98/icons.tsx.js')).toBe(true);
    const loaded = plainImport('themes/w98/w98.js');
    expect(loaded.status, loaded.stderr).toBe(0);
    expect(JSON.parse(loaded.stdout).size).toBe(20);
  });
});

describe('each build compiles to a path of its own', () => {
  it('two themes built in one command importing one registry each compile their own copy', () => {
    write(
      'themes/icons.tsx',
      `import * as React from 'react';\nexport const seaIcons = {close: <svg width={16} />};\n`,
    );
    write(
      'themes/ocean.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {seaIcons} from './icons';\nexport const ocean = defineTheme({name: 'ocean', icons: seaIcons, tokens: {'--color-accent': '#0066cc'}});\n`,
    );
    write(
      'themes/calm.ts',
      `import {defineTheme} from '@astryxdesign/core/theme';\nimport {ocean} from './ocean';\nimport {seaIcons} from './icons';\nexport const calm = defineTheme({extends: ocean, name: 'calm', icons: seaIcons});\n`,
    );
    const r = cli(['theme', 'build', 'themes/ocean.ts', 'themes/calm.ts']);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(read('themes/ocean.js')).toContain(
      "from './ocean.modules/icons.tsx.js'",
    );
    expect(read('themes/calm.js')).toContain(
      "from './calm.modules/icons.tsx.js'",
    );
    expect(read('themes/calm.modules/icons.tsx.js')).toContain(
      'react/jsx-runtime',
    );
    for (const name of ['ocean', 'calm']) {
      const loaded = plainImport(`themes/${name}.js`);
      expect(loaded.status, loaded.stderr).toBe(0);
    }
  });

  it('two --out builds into one folder, each with its own icons.tsx, never share a compiled path', async () => {
    for (const name of ['a', 'b']) {
      write(
        `themes/${name}/icons.tsx`,
        `import * as React from 'react';\nexport const w98Icons = {close: <svg width={${name === 'a' ? 1 : 2}} />};\n`,
      );
      write(
        `themes/${name}/t.ts`,
        THEME.replace("name: 'w98'", `name: '${name}'`),
      );
    }
    for (const name of ['a', 'b']) {
      const built = await captured(() =>
        themeBuild(
          `themes/${name}/t.ts`,
          {out: `dist/${name}.css`},
          {cwd: dir},
        ),
      );
      expect(built.err).toBeUndefined();
    }
    expect(read('dist/a.modules/icons.tsx.js')).toContain('width: 1');
    expect(read('dist/b.modules/icons.tsx.js')).toContain('width: 2');
    expect(JSON.parse(plainImport('dist/a.js').stdout).size).toBe(1);
    expect(JSON.parse(plainImport('dist/b.js').stdout).size).toBe(2);
  });

  it('helpers of one path in two folders compile to two paths in one batch', () => {
    write('lib/s.ts', `export const size: number = 1;\n`);
    write('p/lib/s.ts', `export const size: number = 2;\n`);
    write(
      'p/icons.tsx',
      `import * as React from 'react';\nimport {size as one} from '../lib/s';\nimport {size as two} from './lib/s';\nexport const w98Icons = {close: <svg width={one + two} />};\n`,
    );
    write('p/one.ts', THEME.replace("name: 'w98'", "name: 'one'"));
    write('p/two.ts', THEME.replace("name: 'w98'", "name: 'two'"));
    const r = cli(['theme', 'build', 'p/one.ts', 'p/two.ts']);
    expect(r.status, r.stderr + r.stdout).toBe(0);
    expect(exists('p/one.modules/lib/s.ts.js')).toBe(true);
    expect(exists('p/one.modules/p/lib/s.ts.js')).toBe(true);
    expect(JSON.parse(plainImport('p/two.js').stdout).size).toBe(3);
  });

  it('an --out rebuild replaces its compiled modules without a warning', async () => {
    write('themes/w98/icons.tsx', ICONS_TSX);
    write('themes/w98/helper.ts', HELPER_TS);
    write('themes/w98/w98Theme.ts', THEME);
    const build = () =>
      captured(() =>
        themeBuild('themes/w98/w98Theme.ts', {out: 'dist/w98.css'}, {cwd: dir}),
      );
    await build();
    const again = await build();
    expect(again.err).toBeUndefined();
    expect(again.lines.filter(l => /^Warning/.test(l))).toEqual([]);
    expect(again.result.data.warnings ?? []).toEqual([]);
  });

  it('a .jsx registry: the compiled copy never shadows it, and a watch follows the source', async () => {
    write(
      'themes/w98/icons.jsx',
      `import * as React from 'react';\nexport const w98Icons = {close: <svg width={16} />};\n`,
    );
    write('themes/w98/w98Theme.ts', THEME);
    await quiet(() => themeBuild('themes/w98/w98Theme.ts', {}, {cwd: dir}));
    expect(exists('themes/w98/w98.modules/icons.jsx.js')).toBe(true);
    expect(exists('themes/w98/icons.js')).toBe(false);
    const watched = themeSourceFiles(path.join(dir, 'themes/w98/w98Theme.ts'));
    expect(watched).toContain(path.join(dir, 'themes/w98/icons.jsx'));
    expect(watched).not.toContain(
      path.join(dir, 'themes/w98/w98.modules/icons.jsx.js'),
    );
    // The registry edited: the next build reads the source, not the copy.
    write(
      'themes/w98/icons.jsx',
      `import * as React from 'react';\nexport const w98Icons = {close: <svg width={32} />};\n`,
    );
    await quiet(() => themeBuild('themes/w98/w98Theme.ts', {}, {cwd: dir}));
    expect(read('themes/w98/w98.modules/icons.jsx.js')).toContain('32');
  });
});

describe('a package whose built theme module imports TypeScript source', () => {
  it('is named by the shipped-imports check, and passes once built self-contained', async () => {
    write(
      'pkg/package.json',
      JSON.stringify({
        name: '@acme/w98',
        version: '1.0.0',
        type: 'module',
        exports: {'./themes/w98': './themes/w98/w98.js'},
      }),
    );
    write('pkg/themes/w98/icons.tsx', ICONS_TSX);
    write('pkg/themes/w98/helper.ts', HELPER_TS);
    // A built module as a CLI before this one wrote it: importing the
    // registry's TypeScript source.
    write(
      'pkg/themes/w98/w98.js',
      `/**\n * @generated by \`astryx theme build\` — do not edit manually.\n */\n\nimport { w98Icons } from './icons';\nexport const w98Theme = {name: 'w98', icons: w98Icons};\n`,
    );
    const pkg = path.join(dir, 'pkg');
    const before = shippedImportFindings(pkg, {files: filesOnDisk(pkg)});
    expect(before.findings.map(f => f.code)).toEqual([
      'built_module_imports_typescript',
    ]);
    expect(before.findings[0].message).toContain(
      'themes/w98/w98.js:5: built module imports TypeScript source: "./icons" names themes/w98/icons.tsx',
    );
    // Built again: the module imports compiled JavaScript.
    write('pkg/themes/w98/w98Theme.ts', THEME);
    fs.symlinkSync(
      path.join(dir, 'node_modules'),
      path.join(pkg, 'node_modules'),
      'dir',
    );
    await quiet(() => themeBuild('themes/w98/w98Theme.ts', {}, {cwd: pkg}));
    const after = shippedImportFindings(pkg, {files: filesOnDisk(pkg)});
    expect(after.findings).toEqual([]);
  });
});
