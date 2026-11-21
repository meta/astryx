// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A role's icons and status dots take the shade nearest its fill that reads at 3:1, as graphics need, not text's 4.5:1.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet, themeEditShow} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {parseColor, ratio} from './_color.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** @param {string} slug */
const css = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/** The light half of a token in a theme's built CSS. @param {string} slug @param {string} token */
const lightOf = (slug, token) =>
  new RegExp(`${token}: light-dark\\((#[0-9a-f]{6}),`).exec(css(slug))?.[1];

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-role-reach-more-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral', 'stone']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('icons and status dots', () => {
  it('a status dot reads at 3:1 nearer the fill than text does', async () => {
    await themeEditNew('sunny', {cwd, like: 'neutral'});
    await themeEditSet('sunny', 'warning', '#ffce2f', {cwd});
    const icon = String(lightOf('sunny', '--color-icon-warning'));
    const text = String(lightOf('sunny', '--color-text-warning'));
    const page = String(lightOf('sunny', '--color-background-body'));
    const rgb = (/** @type {string} */ x) =>
      /** @type {[number, number, number]} */ (parseColor(x));
    expect(ratio(rgb(icon), rgb(page))).toBeGreaterThanOrEqual(3);
    // Lighter than the text shade: nearer the bright fill.
    expect(ratio(rgb(icon), rgb(page))).toBeLessThan(
      ratio(rgb(text), rgb(page)),
    );
  }, 120_000);
});
