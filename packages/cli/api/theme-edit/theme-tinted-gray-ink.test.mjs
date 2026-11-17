// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A tinted gray carries its tint into primary text and icons: the darkest
 * shade inside its ramp in light, the lightest in dark, never pure black or
 * white. A pure gray keeps black and white.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {
  makeLinkedFixture,
  removeLinkedFixture,
} from '../../test-utils/linked-fixture.mjs';
import {FIXTURE_PACKAGES} from '../../test-utils/base-theme-fixture.mjs';
import {installRealBaseThemes} from '../../test-utils/real-base-themes.mjs';
import {parseColor, ratio} from './_color.mjs';
import {hexToOklch} from '../theme/palette/generate/color.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

/** @type {string} */
let cwd;

/** @param {string} slug @param {string} token @returns {[string, string]} */
const halves = (slug, token) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  const m = new RegExp(
    `${token}: light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\)`,
  ).exec(css);
  if (!m) throw new Error(`${token} is not a light-dark() pair in ${slug}`);
  return [m[1], m[2]];
};

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-tinted-ink-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('primary ink of a gray', () => {
  it('a slate gray tints primary text and icons in both modes', async () => {
    await themeEditNew('slate', {cwd, like: 'neutral'});
    await themeEditSet('slate', 'neutral', '#64748b', {cwd});
    const [light, dark] = halves('slate', '--color-text-primary');
    expect(light).not.toBe('#000000');
    expect(dark).not.toBe('#ffffff');
    const slate = hexToOklch('#64748b').H;
    for (const c of [light, dark]) {
      const gap = Math.abs(((hexToOklch(c).H - slate + 540) % 360) - 180);
      expect(gap, c).toBeLessThan(25);
    }
    const [page] = halves('slate', '--color-background-body');
    expect(
      ratio(
        /** @type {[number, number, number]} */ (parseColor(light)),
        /** @type {[number, number, number]} */ (parseColor(page)),
      ),
    ).toBeGreaterThanOrEqual(12);
    expect(halves('slate', '--color-icon-primary')[0]).not.toBe('#000000');
  }, 240_000);

  it('a pure gray keeps black and white', async () => {
    await themeEditNew('gray', {cwd, like: 'neutral'});
    await themeEditSet('gray', 'neutral', '#777777', {cwd});
    expect(halves('gray', '--color-text-primary')).toEqual([
      '#000000',
      '#ffffff',
    ]);
  }, 240_000);

  it('a slate gray tints the text an inverted surface reads too', () => {
    // Its inverted and dark surfaces take the tint, so the text on them does.
    for (const token of ['--color-on-dark', '--color-on-light'])
      for (const c of halves('slate', token))
        expect(c, token).not.toMatch(/^#(?:000000|ffffff)$/);
  });
});
