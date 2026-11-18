// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The status colors a look grows: the warning tint stands apart from
 * the warning fill in light mode (the fill already sits at the pale stop
 * the other tints take), and an exact value the theme sets for a status
 * token is named in the change, never counted among the colors that moved
 * with the look.
 */

import * as fs from 'node:fs';
import * as path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {lookCollapsed} from './_palette.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;
/** Why a bundled theme could not be installed here, when it could not. */
let unbuilt = '';

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-status-apart-', FIXTURE_PACKAGES);
  unbuilt = await installRealBaseThemes(cwd, ['neutral']);
}, 600_000);

afterAll(() => removeLinkedFixture(cwd));

/** @param {import('vitest').TestContext} test */
const needsBases = test => {
  if (unbuilt) {
    console.warn(`skipped: ${unbuilt}`);
    test.skip();
  }
};

/**
 * A token's light half in a theme's built CSS.
 * @param {string} slug @param {string} token
 */
const light = (slug, token) =>
  new RegExp(`${token}: light-dark\\((#[0-9a-f]{6})`).exec(
    fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8'),
  )?.[1];

const T = 300_000;

describe('status colors the look grows', () => {
  it(
    'keeps the warning tint apart from the warning fill in light mode',
    async test => {
      needsBases(test);
      await themeEditNew('w', {cwd, like: 'neutral'});
      await themeEditSet('w', 'accent', '#0052cc', {cwd});
      const fill = light('w', '--color-warning');
      const tint = light('w', '--color-warning-muted');
      expect(fill).toBeTruthy();
      expect(tint).toBeTruthy();
      expect(tint).not.toBe(fill);
    },
    T,
  );

  it(
    'names an exact status value the theme sets, apart from the look',
    async test => {
      needsBases(test);
      await themeEditNew('e', {cwd, like: 'neutral'});
      await themeEditSet('e', 'accent', '#0052cc', {cwd});
      const r = /** @type {any} */ (
        await themeEditSet('e', '--color-error', '#b91c1c', {cwd})
      );
      const lines = /** @type {string[]} */ (r.data.changedTokens);
      expect(lines.some(l => /^--color-error\b/.test(l))).toBe(true);
      expect(lines.join('\n')).not.toMatch(
        /status colors .*moved with the look/,
      );
    },
    T,
  );

  it('counts only what the theme did not set exactly', () => {
    const {lines, look} = lookCollapsed(
      [
        '--color-error (light): #c9303a -> #b91c1c',
        '--color-text-error (light): #a1262e -> #9f1d1d',
      ],
      ['error'],
      ['--color-error'],
    );
    expect(lines).toEqual([
      '--color-error (light): #c9303a -> #b91c1c',
      'status colors (error): 1 values moved with the look',
    ]);
    expect(look).toEqual(['--color-text-error (light): #a1262e -> #9f1d1d']);
  });
});
