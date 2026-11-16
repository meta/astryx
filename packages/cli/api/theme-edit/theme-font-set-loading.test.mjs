// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a font set says and writes about loading: an open font whose
 * package is not installed is named with its install line, a family typed
 * alone takes the fallbacks of the kind its installed package names, and
 * corners on a part with no edge offer a fill first.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {refusal} from '../../test-utils/theme-edit-fixture.mjs';
import {
  FIXTURE_PACKAGES,
  writeFixtureBaseTheme,
} from '../../test-utils/base-theme-fixture.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

beforeAll(() => {
  cwd = makeLinkedFixture('astryx-theme-font-loading-', FIXTURE_PACKAGES);
  writeFixtureBaseTheme(cwd, 'neutral');
}, 240_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a font set', () => {
  it('names an open font that does not load until its package is installed', async () => {
    await themeEditNew('ro', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('ro', 'font', 'rounded', {cwd})
    );
    expect(r.data.fontNotLoaded).toEqual([
      {family: 'Nunito', run: [expect.stringMatching(/@fontsource\/nunito$/)]},
    ]);
    // A font that loads is no entry.
    const sys = /** @type {any} */ (
      await themeEditSet('ro', 'font', 'system', {cwd})
    );
    expect(sys.data.fontNotLoaded).toBeUndefined();
  }, 240_000);

  it('gives a family typed alone the fallbacks of the kind its installed package names', async () => {
    await themeEditNew('se', {cwd, like: 'neutral'});
    const before = /** @type {any} */ (
      await themeEditSet('se', 'font', 'Lora', {cwd, on: 'heading'})
    );
    expect(JSON.stringify(before.data.changedTokens)).toContain(
      'Lora, system-ui, sans-serif',
    );
    const dir = path.join(cwd, 'node_modules', '@fontsource', 'lora');
    fs.mkdirSync(dir, {recursive: true});
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({
        name: '@fontsource/lora',
        version: '5.0.0',
        exports: {'.': './index.css', './*': './*.css'},
      }),
    );
    fs.writeFileSync(
      path.join(dir, 'index.css'),
      "@font-face { font-family: 'Lora'; src: url(./files/lora.woff2); }\n",
    );
    fs.writeFileSync(
      path.join(dir, 'metadata.json'),
      JSON.stringify({id: 'lora', family: 'Lora', category: 'serif'}),
    );
    try {
      // (Another role, so the set builds again.)
      const after = /** @type {any} */ (
        await themeEditSet('se', 'font', 'Lora', {cwd, on: 'body'})
      );
      expect(JSON.stringify(after.data.changedTokens)).toContain(
        'Lora, Georgia, serif',
      );
    } finally {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  }, 240_000);
});

describe('corners on a part with no edge of its own', () => {
  it('say to give the part a background or a border first, and take its corners after one', async () => {
    await themeEditNew('ca', {cwd, like: 'neutral'});
    const e = await refusal(() =>
      themeEditSet('ca', 'border-radius', '12px', {cwd, on: 'calendar'}),
    );
    expect(e.code).toBe('ERR_THEME_NO_EFFECT');
    expect(e.message).toMatch(/give it a background or a border first/);
    expect(e.run[0]).toMatch(/ how calendar$/);
    // With a border of its own, the calendar takes its corners.
    await themeEditSet('ca', 'border', '1px solid var(--color-border)', {
      cwd,
      on: 'calendar',
    });
    const r = /** @type {any} */ (
      await themeEditSet('ca', 'border-radius', '12px', {cwd, on: 'calendar'})
    );
    expect(r.data.setting).toMatchObject({
      thing: 'border-radius',
      on: 'calendar',
    });
  }, 240_000);
});
