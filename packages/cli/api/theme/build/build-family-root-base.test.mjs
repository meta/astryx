// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A theme family whose root extends a base the family does not select
 * (a package theme) builds: the root carries its base as its standalone
 * build does; a non-root member whose base is not selected is refused
 * naming the base.
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
    fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-build-famroot-')),
  );
  fs.writeFileSync(path.join(dir, 'package.json'), '{"type":"module"}\n');
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
const exists = rel => fs.existsSync(path.join(dir, rel));

const THEME = `export default {name: 'p', tokens: {'--color-accent': '#123456'}};\n`;

/** @param {() => Promise<unknown>} run */
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

/** A base-theme package of the test's own, needing only Core. */
const writeBasePackage = () => {
  write(
    'node_modules/@fixture/base-theme/package.json',
    JSON.stringify({
      name: '@fixture/base-theme',
      version: '1.0.0',
      type: 'module',
      exports: {'.': './index.mjs'},
    }),
  );
  write(
    'node_modules/@fixture/base-theme/icons.mjs',
    `export const baseIcons = {close: 'base-close'};\n`,
  );
  write(
    'node_modules/@fixture/base-theme/index.mjs',
    `import {defineTheme} from '@astryxdesign/core/theme';\nimport {baseIcons} from './icons.mjs';\nexport const baseTheme = defineTheme({name: 'base', tokens: {'--color-accent': '#123456', '--color-bg': '#fafafa'}, icons: baseIcons});\n`,
  );
};
const I = "import {defineTheme} from '@astryxdesign/core/theme';\n";

describe('a family whose root extends a base the family does not select', () => {
  it('builds, the root carrying its base as its standalone build does', async () => {
    writeBasePackage();
    write(
      'fam/ocean.ts',
      `${I}import {baseTheme} from '@fixture/base-theme';\nexport const ocean = defineTheme({extends: baseTheme, name: 'ocean', tokens: {'--color-bg': '#e0f0ff'}});\n`,
    );
    write(
      'fam/ocean-calm.ts',
      `${I}import {ocean} from './ocean.ts';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', tokens: {'--color-bg': '#f0f8ff'}});\n`,
    );
    const r = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts'],
        {familyKey: 'k'},
        {cwd: dir},
      ),
    );
    expect(r.err).toBeUndefined();
    const css = fs.readFileSync(path.join(dir, 'fam/k.css'), 'utf8');
    // The base's accent reaches the root, and both members' own values.
    expect(css).toContain('#123456');
    expect(css).toContain('#e0f0ff');
    expect(css).toContain('#f0f8ff');
    // The module carries the icons the root inherits from its package base,
    // to each member, and loads in plain Node.
    const loaded = spawnSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `const m = await import(${JSON.stringify(path.join(dir, 'fam/k.js'))}); console.log(m.oceanTheme.icons.close, m.oceanCalmTheme.icons.close);`,
      ],
      {cwd: dir, encoding: 'utf8', timeout: 60_000},
    );
    expect(loaded.status, loaded.stderr).toBe(0);
    expect(loaded.stdout.trim()).toBe('base-close base-close');
    const solo = await captured(() =>
      themeBuild('fam/ocean.ts', {}, {cwd: dir}),
    );
    expect(solo.err).toBeUndefined();
    expect(fs.readFileSync(path.join(dir, 'fam/ocean.css'), 'utf8')).toContain(
      '#123456',
    );
  });

  it('the receipt names the base package the root extends', async () => {
    writeBasePackage();
    write(
      'fam/ocean.ts',
      `${I}import {baseTheme} from '@fixture/base-theme';\nexport const ocean = defineTheme({extends: baseTheme, name: 'ocean', tokens: {}});\n`,
    );
    write(
      'fam/ocean-calm.ts',
      `${I}import {ocean} from './ocean.ts';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', tokens: {}});\n`,
    );
    const r = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts'],
        {familyKey: 'k'},
        {cwd: dir},
      ),
    );
    expect(r.err).toBeUndefined();
    expect(r.result.data.base).toEqual({
      theme: 'base',
      package: '@fixture/base-theme',
      export: 'baseTheme',
    });
    // The text says the same, as the receipt does.
    expect(r.lines.join('\n')).toContain(
      "requires @fixture/base-theme (baseTheme) for ocean's base base",
    );
  });

  it('a family whose root extends nothing, or only selected themes, has no base in its receipt', async () => {
    write(
      'fam/ocean.ts',
      `${I}export const ocean = defineTheme({name: 'ocean', tokens: {'--color-bg': '#e0f0ff'}});\n`,
    );
    write(
      'fam/ocean-calm.ts',
      `${I}import {ocean} from './ocean.ts';\nexport const calm = defineTheme({extends: ocean, name: 'ocean-calm', tokens: {}});\n`,
    );
    write(
      'fam/ocean-still.ts',
      `${I}import {calm} from './ocean-calm.ts';\nexport default defineTheme({extends: calm, name: 'ocean-still', tokens: {}});\n`,
    );
    const r = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts', 'fam/ocean-still.ts'],
        {familyKey: 'k'},
        {cwd: dir},
      ),
    );
    expect(r.err).toBeUndefined();
    expect(r.result.data.base).toBeUndefined();
    expect(r.lines.join('\n')).not.toContain('requires');
    expect(Object.hasOwn(r.result.data, 'base')).toBe(false);
  });

  it('a root extending a local-file base that supplies no registries names it with package null', async () => {
    write(
      'shared/base.ts',
      `${I}export const sharedTheme = defineTheme({name: 'shared', tokens: {'--color-accent': '#654321'}});\n`,
    );
    write(
      'fam/ocean.ts',
      `${I}import {sharedTheme} from '../shared/base.ts';\nexport const ocean = defineTheme({extends: sharedTheme, name: 'ocean', tokens: {}});\n`,
    );
    write(
      'fam/ocean-calm.ts',
      `${I}import {ocean} from './ocean.ts';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', tokens: {}});\n`,
    );
    const r = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts'],
        {familyKey: 'k'},
        {cwd: dir},
      ),
    );
    expect(r.err).toBeUndefined();
    expect(r.result.data.base).toEqual({
      theme: 'shared',
      package: null,
      export: 'sharedTheme',
    });
    expect(r.lines.join('\n')).toContain(
      "ocean's base shared is a local theme (sharedTheme) the family does not select",
    );
    expect(fs.readFileSync(path.join(dir, 'fam/k.css'), 'utf8')).toContain(
      '#654321',
    );
  });

  it('a base the root file defines itself is a local base: its own extends, not the first in the file', async () => {
    writeBasePackage();
    write(
      'fam/ocean.ts',
      `${I}import {baseTheme} from '@fixture/base-theme';\nconst brand = defineTheme({extends: baseTheme, name: 'brand', tokens: {}});\nexport const ocean = defineTheme({extends: brand, name: 'ocean', tokens: {}});\n`,
    );
    write(
      'fam/ocean-calm.ts',
      `${I}import {ocean} from './ocean.ts';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', tokens: {}});\n`,
    );
    // The package base supplies icons, which a local base cannot carry.
    const refused = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts'],
        {familyKey: 'k'},
        {cwd: dir},
      ),
    );
    expect(refused.err?.code).toBe('ERR_THEME_INVALID');
    expect(refused.err.message).toContain(
      'Theme "ocean" extends "brand", a theme ocean.ts defines itself',
    );
    expect(fs.existsSync(path.join(dir, 'fam/k.css'))).toBe(false);
    // The same layout over a base with no registries builds, its receipt
    // naming the local base.
    write(
      'fam/ocean.ts',
      `${I}const brand = defineTheme({name: 'brand', tokens: {'--color-accent': '#abcdef'}});\nexport const ocean = defineTheme({extends: brand, name: 'ocean', tokens: {}});\n`,
    );
    const built = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts'],
        {familyKey: 'k'},
        {cwd: dir},
      ),
    );
    expect(built.err).toBeUndefined();
    expect(built.result.data.base).toEqual({
      theme: 'brand',
      package: null,
      export: null,
    });
  });

  it('a base package that is not installed fails naming the package and the theme, writing nothing', async () => {
    write(
      'fam/ocean.ts',
      `${I}import {baseTheme} from '@fixture/base-theme';\nexport const ocean = defineTheme({extends: baseTheme, name: 'ocean', tokens: {}});\n`,
    );
    write(
      'fam/ocean-calm.ts',
      `${I}import {ocean} from './ocean.ts';\nexport default defineTheme({extends: ocean, name: 'ocean-calm', tokens: {}});\n`,
    );
    const r = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/ocean-calm.ts'],
        {familyKey: 'k'},
        {cwd: dir},
      ),
    );
    expect(r.err?.code).toBe('ERR_THEME_LOAD');
    expect(r.err.message).toContain('Failed to load theme from fam/ocean.ts');
    expect(r.err.message).toContain('@fixture/base-theme');
    expect(r.err.suggestions?.[0]?.name).toContain('@fixture/base-theme');
    expect(fs.existsSync(path.join(dir, 'fam/k.css'))).toBe(false);
  });

  it('a base the package does not export fails naming it, never building without the base', async () => {
    writeBasePackage();
    write(
      'fam/ocean.ts',
      `import {nopeTheme} from '@fixture/base-theme';\nexport const ocean = {name: 'ocean', extends: nopeTheme, tokens: {}};\n`,
    );
    const r = await captured(() => themeBuild('fam/ocean.ts', {}, {cwd: dir}));
    expect(r.err?.code).toBe('ERR_THEME_LOAD');
    expect(r.err.message).toContain(
      `Theme "ocean" extends nopeTheme from '@fixture/base-theme', which is undefined`,
    );
    expect(fs.existsSync(path.join(dir, 'fam/ocean.css'))).toBe(false);
  });

  it('a non-root member whose base is not selected is refused naming that base', async () => {
    writeBasePackage();
    write(
      'fam/ocean.ts',
      `${I}export const ocean = defineTheme({name: 'ocean', tokens: {}});\n`,
    );
    write(
      'fam/mid.ts',
      `${I}import {ocean} from './ocean.ts';\nexport const mid = defineTheme({extends: ocean, name: 'mid', tokens: {}});\n`,
    );
    write(
      'fam/leaf.ts',
      `${I}import {mid} from './mid.ts';\nexport default defineTheme({extends: mid, name: 'leaf', tokens: {}});\n`,
    );
    const r = await captured(() =>
      themeBuildFamily(
        ['fam/ocean.ts', 'fam/leaf.ts'],
        {familyKey: 'k'},
        {cwd: dir},
      ),
    );
    expect(r.err?.code).toBe('ERR_THEME_INVALID');
    expect(r.err.message).toContain(
      'Theme "leaf" is missing selected ancestor "mid"',
    );
    expect(r.err.message).toContain('Select "mid" too');
    expect(fs.existsSync(path.join(dir, 'fam/k.css'))).toBe(false);
  });
});
