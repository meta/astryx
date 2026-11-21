// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Font families map to Fontsource packages as Fontsource names them
 * (variable families included, never a system font); an installed package
 * loads every weight the theme uses; and `compile --check` names a missing
 * output in its check result.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {fontsourcePackageOf, fontsourceSuggestion} from './_settings.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';
import {runCli} from '../../test-utils/run-cli.mjs';
import {realRenders} from '../../test-utils/theme-render-stub.mjs';

// (These cases read the drawn pages, their pictures or what a drawing
// reports: drawn for real.)
realRenders(true);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture(
    'astryx-theme-font-families-map-fontsource-',
    FIXTURE_PACKAGES,
  );
  writeFixtureBaseTheme(cwd, 'neutral');
}, 120_000);

afterAll(() => {
  removeLinkedFixture(cwd);
});

/** @param {string} rel */
const read = rel => fs.readFileSync(path.join(cwd, rel), 'utf8');
/** @param {string[]} args */
const cli = async args => {
  const r = await runCli(args, {cwd});
  return {status: r.status, stdout: r.stdout, stderr: r.stderr};
};

/**
 * A stand-in Fontsource package as Fontsource ships one: its index
 * stylesheet and one stylesheet per weight (a variable package: its index
 * only). Returns its remover.
 * @param {string} name the package name
 * @param {string} family
 * @param {number[]} weights
 */
const installFont = (name, family, weights) => {
  const pkg = path.join(path.dirname(cwd), 'node_modules', name);
  fs.mkdirSync(pkg, {recursive: true});
  fs.writeFileSync(
    path.join(pkg, 'package.json'),
    JSON.stringify({name, version: '5.0.0', main: 'index.css'}),
  );
  /** @param {number} w */
  const face = w =>
    `@font-face {\n  font-family: '${family}';\n  font-weight: ${w};\n  src: url(./${w}.woff2);\n}\n`;
  fs.writeFileSync(path.join(pkg, 'index.css'), face(400));
  for (const w of weights)
    fs.writeFileSync(path.join(pkg, `${w}.css`), face(w));
  return () => fs.rmSync(pkg, {recursive: true, force: true});
};

describe("a family's Fontsource package", () => {
  it('is named as Fontsource names it', async () => {
    expect(fontsourcePackageOf('Inter Variable')).toBe(
      '@fontsource-variable/inter',
    );
    expect(fontsourcePackageOf('Roboto Flex Variable')).toBe(
      '@fontsource-variable/roboto-flex',
    );
    expect(fontsourcePackageOf('Mrs. Sheppards')).toBe(
      '@fontsource/mrs-sheppards',
    );
    expect(fontsourcePackageOf('微软雅黑')).toBe(null);
  });

  it('is never suggested for a font a system ships', async () => {
    for (const family of [
      'Microsoft YaHei',
      'PingFang SC',
      'Hiragino Sans',
      'Segoe UI',
      '微软雅黑',
    ])
      expect(fontsourceSuggestion(family), family).toBe(null);
  });

  it('loads an installed variable package, and names one when it is missing', async () => {
    await themeEditNew('v1', {cwd});
    const missing = await themeEditSet('v1', 'font', 'Inter Variable', {cwd});
    const note = missing.data.notes.join(' ');
    expect(note).toContain('@fontsource-variable/inter');
    expect(note).not.toContain('@fontsource/inter-variable');
    const remove = installFont(
      '@fontsource-variable/inter',
      'Inter Variable',
      [],
    );
    try {
      await themeEditShow('v1', {cwd});
      expect(read('src/themes/v1/v1.fonts.css')).toContain(
        '@fontsource-variable/inter/index.css',
      );
    } finally {
      remove();
    }
  }, 240_000);

  it('gives no install line for a system font of another platform', async () => {
    await themeEditNew('v2', {cwd});
    const r = await themeEditSet('v2', 'font', 'Microsoft YaHei, sans-serif', {
      cwd,
    });
    expect(r.data.notes.join(' ')).not.toContain('@fontsource/microsoft');
  }, 240_000);
});

describe('the font dial', () => {
  it('takes a CSS-escaped family, as the token does', async () => {
    await themeEditNew('v4', {cwd});
    const B = '\\';
    const r = await themeEditSet(
      'v4',
      'font',
      `${B}5FAE${B}8F6F${B}96C5${B}9ED1, Noto Sans SC, sans-serif`,
      {cwd},
    );
    const notes = r.data.notes.join(' ');
    // A system font of Windows by its Chinese name: no package named.
    expect(notes).not.toMatch(/@fontsource\/[^a-z0-9-]/);
  }, 240_000);
});

describe('an installed font package', () => {
  it('loads every weight the theme uses, in the app copy and the previews', async () => {
    await themeEditNew('v3', {cwd});
    const remove = installFont(
      '@fontsource/lora',
      'Lora',
      [300, 400, 500, 600, 700, 800],
    );
    try {
      const r = await themeEditSet('v3', 'font', 'lora', {cwd});
      const sheet = read('src/themes/v3/v3.fonts.css');
      for (const w of [400, 500, 600, 700])
        expect(sheet).toContain(`@fontsource/lora/${w}.css`);
      expect(sheet).not.toContain('@fontsource/lora/300.css');
      expect(read('themes/v3/preview.html')).toMatch(/font-weight:\s*600/);
      expect(r.data.notes.join(' ')).toContain('@fontsource/lora/600.css');
    } finally {
      remove();
    }
  }, 240_000);
});

describe('compile --check of an editor theme', () => {
  it('names a missing output in its check result', async () => {
    await themeEditNew('v9', {cwd});
    fs.rmSync(path.join(cwd, 'themes/v9/v9.d.ts'));
    const r = await cli([
      '--json',
      'experimental',
      'theme',
      'compile',
      'themes/v9/v9.theme.ts',
      '--check',
    ]);
    expect(r.status).toBe(1);
    const out = JSON.parse(r.stdout);
    expect(out.data.upToDate).toBe(false);
    expect(out.data.code).toBe('ERR_THEME_STALE');
    expect(JSON.stringify(out.data.stale)).toContain('v9.d.ts');
  }, 240_000);
});
