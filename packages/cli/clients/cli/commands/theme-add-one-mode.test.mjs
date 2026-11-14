// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `theme add` of a theme whose built module exports one color mode
 * (`export const colorModes = ["light"];`): the receipt carries that `mode`,
 * the generated module lists it in `themeModes`, and the first import's
 * wiring passes the selected theme's mode to `Theme`. A theme with both modes
 * keeps every output exactly as before.
 */

import {afterEach, describe, expect, it} from 'vitest';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import {runCli} from '../../../test-utils/run-cli.mjs';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {renderThemeModule} from '../../../foundation/config/theme-state.mjs';

/** @type {string[]} */
const dirs = [];
afterEach(() => {
  for (const d of dirs.splice(0)) fs.rmSync(d, {recursive: true, force: true});
});

/**
 * An app with package themes `ocean` and `sand`; `extra` follows ocean's
 * built theme export.
 * @param {string} extra
 */
function app(extra) {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'astryx-one-mode-'));
  dirs.push(tmpDir);
  fs.mkdirSync(path.join(tmpDir, 'src'));
  fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), '{}\n');
  fs.writeFileSync(
    path.join(tmpDir, 'package.json'),
    JSON.stringify({
      name: 'app',
      private: true,
      dependencies: {'@acme/themes': '^1.0.0', '@astryxdesign/core': '*'},
    }),
  );
  const packageDir = path.join(tmpDir, 'node_modules', '@acme', 'themes');
  const themeDir = path.join(packageDir, 'themes', 'ocean');
  fs.mkdirSync(themeDir, {recursive: true});
  fs.mkdirSync(path.join(packageDir, 'dist'), {recursive: true});
  fs.writeFileSync(
    path.join(packageDir, 'package.json'),
    JSON.stringify({
      name: '@acme/themes',
      version: '1.0.0',
      type: 'module',
      exports: {
        './themes/ocean': './dist/ocean.js',
        './themes/ocean.css': './dist/ocean.css',
        './themes/sand': './dist/sand.js',
        './themes/sand.css': './dist/sand.css',
      },
    }),
  );
  fs.writeFileSync(
    path.join(packageDir, 'astryx.integration.mjs'),
    "export default {themes: './themes'};\n",
  );
  fs.writeFileSync(
    path.join(themeDir, 'oceanTheme.doc.mjs'),
    "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'ocean', displayName: 'Ocean', description: 'Ocean theme.', maintained: true};\n",
  );
  fs.writeFileSync(
    path.join(themeDir, 'oceanTheme.ts'),
    'export const oceanTheme = {};\n',
  );
  fs.writeFileSync(
    path.join(packageDir, 'dist/ocean.js'),
    `export const oceanTheme = {name: 'ocean', __built: true};\n${extra}`,
  );
  fs.writeFileSync(
    path.join(packageDir, 'dist/ocean.css'),
    '[data-astryx-theme="ocean"] {}\n',
  );
  const sandDir = path.join(packageDir, 'themes', 'sand');
  fs.mkdirSync(sandDir, {recursive: true});
  fs.writeFileSync(
    path.join(sandDir, 'sandTheme.doc.mjs'),
    "/** @type {import('@astryxdesign/cli/authoring').ThemeDoc} */\nexport default {type: 'theme', name: 'sand', displayName: 'Sand', description: 'Sand theme.', maintained: true};\n",
  );
  fs.writeFileSync(
    path.join(sandDir, 'sandTheme.ts'),
    'export const sandTheme = {};\n',
  );
  fs.writeFileSync(
    path.join(packageDir, 'dist/sand.js'),
    "export const sandTheme = {name: 'sand', __built: true};\n",
  );
  fs.writeFileSync(
    path.join(packageDir, 'dist/sand.css'),
    '[data-astryx-theme="sand"] {}\n',
  );
  return tmpDir;
}

/** @param {string} dir @param {boolean} json */
const add = (dir, json) =>
  runCli(
    [
      'theme',
      'add',
      'ocean',
      '--package',
      '@acme/themes',
      ...(json ? ['--json'] : []),
    ],
    dir,
  );

/** @param {string} dir */
const generated = dir =>
  fs.readFileSync(path.join(dir, 'src/astryx-themes.ts'), 'utf8');

describe('theme add of a theme with one color mode', () => {
  it.each([
    ['light', 'export const colorModes = ["light"];\n'],
    ['dark', "export const colorModes = ['dark'];\n"],
  ])(
    "%s: the receipt carries the mode, the module lists it, and the wiring passes the selected theme's",
    async (mode, extra) => {
      const dir = app(extra);
      const json = await add(dir, true);
      expect(json.status, json.stderr).toBe(0);
      expect(JSON.parse(json.stdout).data.themes[0].mode).toBe(mode);
      expect(generated(dir)).toContain(
        `export const themeModes: Partial<Record<keyof typeof themes, 'light' | 'dark'>> = {\n  "ocean": "${mode}",\n};`,
      );

      const text = await add(app(extra), false);
      expect(text.status, text.stderr).toBe(0);
      expect(text.stdout).toContain(
        "import {themes, defaultThemeSlug, themeModes} from './astryx-themes';",
      );
      expect(text.stdout).toContain(
        "<Theme theme={themes[defaultThemeSlug]} mode={themeModes[defaultThemeSlug] ?? 'system'}>",
      );
      expect(text.stdout).toMatch(new RegExp(`^mode:\\s+${mode}$`, 'm'));
    },
  );

  it('after theme use of a two-mode theme, the map gives it no mode, so it follows the system', async () => {
    const dir = app('export const colorModes = ["light"];\n');
    expect((await add(dir, true)).status).toBe(0);
    const sand = await runCli(
      ['theme', 'add', 'sand', '--package', '@acme/themes', '--json'],
      dir,
    );
    expect(sand.status, sand.stderr).toBe(0);
    const used = await runCli(['theme', 'use', 'sand', '--json'], dir);
    expect(used.status, used.stderr).toBe(0);
    const themes = JSON.parse(used.stdout).data.themes;
    expect(
      themes.find((/** @type {any} */ t) => t.slug === 'sand'),
    ).not.toHaveProperty('mode');
    expect(generated(dir)).toContain(
      'export const defaultThemeSlug: keyof typeof themes = "sand";',
    );
    expect(generated(dir)).toMatch(/themeModes[^}]*"ocean": "light",\n\};/);
    expect(generated(dir)).not.toMatch(/"sand": "(light|dark)"/);
  });

  it('a theme with both modes keeps its output, its fields and the generated module exactly', async () => {
    const plain = app('');
    for (const json of [false, true]) {
      const a = await add(plain, json);
      expect(a.status, a.stderr).toBe(0);
      if (json)
        expect(JSON.parse(a.stdout).data.themes[0]).not.toHaveProperty('mode');
      else {
        expect(a.stdout).toContain(
          "import {themes, defaultThemeSlug} from './astryx-themes';\n\n<Theme theme={themes[defaultThemeSlug]}>",
        );
        expect(a.stdout).not.toMatch(/^mode:/m);
      }
    }
    expect(generated(plain)).not.toContain('themeModes');
    expect(generated(plain).trimEnd()).toMatch(
      /export const defaultThemeSlug: keyof typeof themes = "ocean";$/,
    );
  });

  it('an unknown or two-entry colorModes export reads as both modes', async () => {
    for (const extra of [
      'export const colorModes = ["night"];\n',
      'export const colorModes = ["light", "dark"];\n',
    ]) {
      const r = await add(app(extra), true);
      expect(r.status, r.stderr).toBe(0);
      expect(JSON.parse(r.stdout).data.themes[0]).not.toHaveProperty('mode');
    }
  });

  it('a one-mode theme added after a two-mode first import prints the wiring that takes its mode', async () => {
    const dir = app('');
    fs.appendFileSync(
      path.join(dir, 'node_modules/@acme/themes/dist/sand.js'),
      'export const colorModes = ["light"];\n',
    );
    expect((await add(dir, true)).status).toBe(0);
    const sand = await runCli(
      ['theme', 'add', 'sand', '--package', '@acme/themes', '--json'],
      dir,
    );
    expect(JSON.parse(sand.stdout).data.change.wireModes).toBe(true);
    // The module already lists modes: a later change prints no update.
    const used = await runCli(['theme', 'use', 'sand'], dir);
    expect(used.stdout).not.toContain('now exports themeModes');
    fs.rmSync(path.join(dir, 'src/astryx-themes.ts'));
    const text = await runCli(
      ['theme', 'add', 'ocean', '--package', '@acme/themes'],
      dir,
    );
    expect(text.status, text.stderr).toBe(0);
    const again = await runCli(
      ['theme', 'add', 'sand', '--package', '@acme/themes'],
      dir,
    );
    expect(again.stdout).toContain('now exports themeModes');
    expect(again.stdout).toContain(
      "<Theme theme={themes[defaultThemeSlug]} mode={themeModes[defaultThemeSlug] ?? 'system'}>",
    );
  });

  it('reads the mode through a theme export that re-exports the built module', async () => {
    const dir = app('export const colorModes = ["dark"];\n');
    const pkg = path.join(dir, 'node_modules/@acme/themes');
    fs.writeFileSync(
      path.join(pkg, 'dist/ocean-entry.js'),
      "export * from './ocean.js';\n",
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'),
    );
    manifest.exports['./themes/ocean'] = './dist/ocean-entry.js';
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify(manifest));
    const r = await add(dir, true);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).data.themes[0].mode).toBe('dark');
  });

  it.each([
    ['a theme with one mode', [/** @type {const} */ ('light')], false],
    ['no theme with one mode, after one was removed', [], true],
  ])(
    'the printed wiring type-checks with exactOptionalPropertyTypes: %s',
    (_label, modes, keepModes) => {
      // A folder inside the CLI package, so Core and React types resolve; the
      // theme is a local stub typed as Theme takes it (no theme package needs
      // to be built).
      const dir = fs.mkdtempSync(
        path.join(import.meta.dirname, '.wiring-tsc-'),
      );
      dirs.push(dir);
      fs.writeFileSync(
        path.join(dir, 'stub-theme.ts'),
        "import type {ComponentProps} from 'react';\nimport type {Theme} from '@astryxdesign/core/theme';\nexport const stubTheme = null as unknown as ComponentProps<typeof Theme>['theme'];\n",
      );
      const module = renderThemeModule(
        [
          {
            slug: 'stub',
            owner: 'stub',
            exportName: 'stubTheme',
            module: './stub-theme',
            stylesheet: './stub.css',
            moduleFile: '',
            stylesheetFile: '',
            source: 'package',
            ...(modes.length ? {mode: modes[0]} : {}),
          },
        ],
        'stub',
        true,
        {keepModes},
      ).replace(/^import "[^"]+";$/gm, '');
      expect(module).toContain('export const themeModes');
      fs.writeFileSync(path.join(dir, 'astryx-themes.ts'), module);
      fs.writeFileSync(
        path.join(dir, 'app.tsx'),
        "import {Theme} from '@astryxdesign/core/theme';\nimport {themes, defaultThemeSlug, themeModes} from './astryx-themes';\n\nexport const App = () => (\n  <Theme theme={themes[defaultThemeSlug]} mode={themeModes[defaultThemeSlug] ?? 'system'}>\n    <div />\n  </Theme>\n);\n",
      );
      fs.writeFileSync(
        path.join(dir, 'tsconfig.json'),
        JSON.stringify({
          compilerOptions: {
            strict: true,
            exactOptionalPropertyTypes: true,
            jsx: 'react-jsx',
            module: 'esnext',
            moduleResolution: 'bundler',
            noEmit: true,
            skipLibCheck: true,
            target: 'es2022',
          },
          files: ['app.tsx'],
        }),
      );
      const tsc = createRequire(
        path.resolve(import.meta.dirname, '../../../../..', 'package.json'),
      ).resolve('typescript/bin/tsc');
      const r = spawnSync(process.execPath, [tsc, '-p', 'tsconfig.json'], {
        cwd: dir,
        encoding: 'utf8',
      });
      expect(r.stdout + r.stderr).toBe('');
      expect(r.status).toBe(0);
    },
    120_000,
  );

  it('removing the last one-mode theme keeps an empty themeModes export', async () => {
    const dir = app('export const colorModes = ["light"];\n');
    expect((await add(dir, true)).status).toBe(0);
    await runCli(['theme', 'add', 'sand', '--package', '@acme/themes'], dir);
    await runCli(['theme', 'use', 'sand'], dir);
    const r = await runCli(['theme', 'remove', 'ocean', '--json'], dir);
    expect(r.status, r.stderr).toBe(0);
    expect(generated(dir)).toContain(
      "export const themeModes: Partial<Record<keyof typeof themes, 'light' | 'dark'>> = {};",
    );
  });

  it('reads the mode where a package module re-exports only its theme by name', async () => {
    const dir = app('export const colorModes = ["dark"];\n');
    const pkg = path.join(dir, 'node_modules/@acme/themes');
    fs.writeFileSync(
      path.join(pkg, 'dist/ocean-entry.js'),
      "import './ocean.css';\nexport {oceanTheme} from './ocean.js';\n",
    );
    const manifest = JSON.parse(
      fs.readFileSync(path.join(pkg, 'package.json'), 'utf8'),
    );
    manifest.exports['./themes/ocean'] = './dist/ocean-entry.js';
    fs.writeFileSync(path.join(pkg, 'package.json'), JSON.stringify(manifest));
    const r = await add(dir, true);
    expect(r.status, r.stderr).toBe(0);
    expect(JSON.parse(r.stdout).data.themes[0].mode).toBe('dark');
  });
});
