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
import {themeBuild, themeBuildFamily} from './build.mjs';
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
    expect(js).toContain("import { w98Icons } from './icons.js';");
    expect(js).not.toMatch(/from '\.\/icons'/);
    expect(read('themes/w98/icons.js')).toContain(
      'Source: themes/w98/icons.tsx',
    );
    expect(read('themes/w98/icons.js')).toContain('from "./helper.js"');
    expect(read('themes/w98/icons.js')).toContain('react/jsx-runtime');
    expect(read('themes/w98/helper.js')).not.toContain(': number');

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
      'themes/w98/helper.js',
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
    expect(read('dist/w98.js')).toContain("from './icons.js'");
    expect(exists('dist/icons.js')).toBe(true);
    expect(exists('dist/helper.js')).toBe(true);
    expect(exists('themes/w98/icons.js')).toBe(false);
    const loaded = plainImport('dist/w98.js');
    expect(loaded.status, loaded.stderr).toBe(0);
  });

  it('never writes a compiled module over a file of yours: that import stays as written', async () => {
    write('themes/w98/icons.tsx', ICONS_TSX);
    write('themes/w98/helper.ts', HELPER_TS);
    write('themes/w98/w98Theme.ts', THEME);
    const mine = '// my own build of the icons\nexport const w98Icons = {};\n';
    write('themes/w98/icons.js', mine);
    await quiet(() => themeBuild('themes/w98/w98Theme.ts', {}, {cwd: dir}));
    expect(read('themes/w98/icons.js')).toBe(mine);
    expect(read('themes/w98/w98.js')).toContain("from './icons'");
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
    expect(js).toContain('"./icons.js"');
    expect(js).not.toContain('icons.ts');
    expect(read('fam/icons.js')).toContain('calm-close');
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
