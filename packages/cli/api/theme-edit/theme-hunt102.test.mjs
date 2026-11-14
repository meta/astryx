// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Compile refuses an editor theme whose source no longer carries its
 * settings, as set does; the app copy loads a font package for a family
 * the theme's own source sets; a build of the copy's source counts the
 * font stylesheet beside it; a blank --out is refused.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {spawnSync} from 'node:child_process';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

/** @type {string} */
let cwd;
const BIN = path.resolve(
  import.meta.dirname,
  '../../clients/cli/bin/astryx.mjs',
);

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-hunt102-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');
/** @param {string[]} args */
const cli = args =>
  spawnSync(process.execPath, [BIN, ...args], {cwd, encoding: 'utf8'});
const compile = (/** @type {string[]} */ ...args) =>
  cli(['experimental', 'theme', 'compile', ...args]);

/** A stand-in installed @fontsource/inter; returns its remover. */
const installInter = () => {
  const pkg = path.join(path.dirname(cwd), 'node_modules/@fontsource/inter');
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({
      name: '@fontsource/inter',
      version: '5.0.0',
      exports: {
        '.': './index.css',
        './index.css': './index.css',
        './package.json': './package.json',
      },
    }),
  );
  fs.writeFileSync(
    path.join(pkg, 'index.css'),
    "@font-face {\n  font-family: 'Inter';\n  src: url(./inter.woff2);\n}\n",
  );
  return () => fs.rmSync(pkg, {recursive: true, force: true});
};

describe('compile refuses a source that no longer carries its settings', () => {
  it('a source naming another theme, and one that stops extending the settings, are refused by compile and --check', async () => {
    await themeEditNew('s8', {cwd});
    const src = path.join(cwd, 'themes/s8/s8.theme.ts');
    const good = read('themes/s8/s8.theme.ts');
    fs.writeFileSync(src, good.replace("name: 's8'", "name: 'brand'"));
    try {
      for (const args of [[], ['--check']]) {
        const r = compile('themes/s8/s8.theme.ts', ...args);
        expect(r.status, args.join(' ')).not.toBe(0);
        expect(r.stdout + r.stderr).toContain(
          "s8.theme.ts no longer names the theme 's8'",
        );
      }
      expect(fs.existsSync(path.join(cwd, 'themes/s8/brand.css'))).toBe(false);
      fs.writeFileSync(
        src,
        good.replace('extends: s8Settings', 'extends: undefined'),
      );
      const r = compile('themes/s8/s8.theme.ts');
      expect(r.status).not.toBe(0);
      expect(r.stdout + r.stderr).toContain('no longer extends s8Settings');
    } finally {
      fs.writeFileSync(src, good);
    }
  }, 240_000);

  it('a blank --out is refused', async () => {
    await themeEditNew('s11', {cwd});
    const r = compile('themes/s11/s11.theme.ts', '--out', ' ');
    expect(r.status).not.toBe(0);
    expect(r.stdout + r.stderr).toContain('--out is blank');
    expect(fs.existsSync(path.join(cwd, ' '))).toBe(false);
    // The stable build refuses it too.
    const stable = cli([
      'theme',
      'build',
      'themes/s11/s11.theme.ts',
      '--out',
      '  ',
    ]);
    expect(stable.status).not.toBe(0);
    expect(stable.stdout + stable.stderr).toContain('--out is blank');
    expect(fs.existsSync(path.join(cwd, '  '))).toBe(false);
  }, 240_000);
});

describe('the app copy fonts follow the families the built theme uses', () => {
  it('a family set in the theme own source, with its package installed, is imported by the copy', async () => {
    await themeEditNew('f10', {cwd});
    const remove = installInter();
    try {
      const src = path.join(cwd, 'themes/f10/f10.theme.ts');
      fs.writeFileSync(
        src,
        read('themes/f10/f10.theme.ts').replace(
          "name: 'f10',",
          "name: 'f10',\n  tokens: {'--font-family-body': 'Inter, sans-serif'},",
        ),
      );
      const r = compile('themes/f10/f10.theme.ts');
      expect(r.status).toBe(0);
      expect(read('src/themes/f10/f10.fonts.css')).toContain(
        '@fontsource/inter/index.css',
      );
      expect(r.stdout + r.stderr).not.toMatch(/not loaded[^\n]*Inter/);
    } finally {
      remove();
    }
  }, 240_000);

  it("a stable build counts only the theme's own font stylesheet, not another one in its folder", async () => {
    const dir = path.join(cwd, 'src/themes/brand');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'brandTheme.ts'),
      "import {defineTheme} from '@astryxdesign/core/theme';\nexport const brandTheme = defineTheme({name: 'brand', tokens: {'--font-family-body': 'Inter, sans-serif'}});\n",
    );
    const remove = installInter();
    try {
      // A stray stylesheet: `theme add` never imports it.
      fs.writeFileSync(
        path.join(dir, 'other.fonts.css'),
        '@import "@fontsource/inter/index.css";\n',
      );
      const stray = cli(['theme', 'build', 'src/themes/brand/brandTheme.ts']);
      expect(stray.stdout + stray.stderr).toMatch(/not loaded[^\n]*Inter/);
      fs.writeFileSync(
        path.join(dir, 'brand.fonts.css'),
        '@import "@fontsource/inter/index.css";\n',
      );
      const own = cli(['theme', 'build', 'src/themes/brand/brandTheme.ts']);
      expect(own.stdout + own.stderr).not.toMatch(/not loaded[^\n]*Inter/);
    } finally {
      remove();
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 240_000);

  it('a stable build of the copy source counts the font stylesheet beside it', async () => {
    await themeEditNew('f5', {cwd});
    await themeEditSet('f5', 'font', 'Inter', {cwd});
    const remove = installInter();
    try {
      await themeEditSet('f5', 'corners', 'pill', {cwd});
      expect(read('src/themes/f5/f5.fonts.css')).toContain('@fontsource/inter');
      const r = cli(['theme', 'build', 'src/themes/f5/f5Theme.ts']);
      expect(r.stdout + r.stderr).not.toMatch(/not loaded[^\n]*Inter/);
    } finally {
      remove();
    }
  }, 240_000);
});
