// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The category colors (Badge, Token and Card tints) and the chart
 * colors follow a theme's look: the editor grows them from Core's hues at
 * the accent's strength and the palette's vibrancy, keeps card tints pale
 * enough for the theme's text, keeps the hues apart (a look that would draw
 * two alike keeps the base theme's, and says why), lets an exact setting
 * win, and says what moved in one line each.
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
import {perceptualDelta} from '../theme/palette/generate/generator.mjs';
import {hexToOklch} from '../theme/palette/generate/color.mjs';

vi.mock('./_preview.mjs', async importOriginal =>
  (await import('../../test-utils/theme-render-stub.mjs')).stubRenders(
    await importOriginal(),
  ),
);

const HUES = [
  'red',
  'orange',
  'yellow',
  'green',
  'teal',
  'cyan',
  'blue',
  'purple',
  'pink',
];
const SERIES = [
  'blue',
  'orange',
  'purple',
  'green',
  'pink',
  'cyan',
  'red',
  'teal',
  'brown',
  'indigo',
];

/** @type {string} */
let cwd;

/** @param {string} slug */
const css = slug =>
  fs.readFileSync(path.join(cwd, 'themes', slug, `${slug}.css`), 'utf8');

/**
 * A token's two halves in a theme's built CSS.
 * @param {string} slug @param {string} token
 * @returns {[string, string]}
 */
const halves = (slug, token) => {
  const m = new RegExp(
    `${token}: light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\)`,
  ).exec(css(slug));
  if (!m) throw new Error(`${token} is not a light-dark() pair in ${slug}`);
  return [m[1], m[2]];
};

/** @param {string} a @param {string} b */
const contrast = (a, b) =>
  ratio(
    /** @type {[number, number, number]} */ (parseColor(a)),
    /** @type {[number, number, number]} */ (parseColor(b)),
  );

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-category-colors-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('category and chart colors follow the look', () => {
  it('grows readable, distinct category colors from a new look', async () => {
    await themeEditNew('vivid', {cwd, like: 'neutral'});
    await themeEditSet('vivid', 'accent', '#7c3aed', {cwd});
    for (const [i, mode] of /** @type {const} */ ([
      'light',
      'dark',
    ]).entries()) {
      const page = halves('vivid', '--color-background-body')[i];
      const text = halves('vivid', '--color-text-primary')[i];
      const secondary = halves('vivid', '--color-text-secondary')[i];
      const drawn = HUES.map(h => ({
        h,
        fill: halves('vivid', `--color-background-${h}`)[i],
        ink: halves('vivid', `--color-text-${h}`)[i],
      }));
      for (const {h, fill, ink} of drawn) {
        // Badge text on its fill and on the page.
        expect(
          contrast(ink, fill),
          `${mode} ${h} on its fill`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(ink, page),
          `${mode} ${h} on the page`,
        ).toBeGreaterThanOrEqual(4.5);
        // The fill is also a card tint: the theme's text reads on it.
        expect(
          contrast(text, fill),
          `${mode} text on ${h} card`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(secondary, fill),
          `${mode} secondary on ${h} card`,
        ).toBeGreaterThanOrEqual(4.5);
      }
      for (const a of drawn)
        for (const b of drawn)
          if (a.h < b.h)
            expect(
              Math.max(
                perceptualDelta(a.fill, b.fill),
                perceptualDelta(a.ink, b.ink),
              ),
              `${mode} ${a.h} and ${b.h} apart`,
            ).toBeGreaterThanOrEqual(2);
    }
    // The theme's palette grows them, so the theme writes them as shades.
    const source = fs.readFileSync(
      path.join(cwd, 'themes', 'vivid', 'vivid.settings.ts'),
      'utf8',
    );
    expect(source).toMatch(
      /"--color-background-blue": \[\s*palette\.blue\.light\[\d+\]/,
    );
  }, 240_000);

  it('gives a dusty accent dusty category tints', async () => {
    await themeEditNew('dusty', {cwd, like: 'neutral'});
    await themeEditSet('dusty', 'accent', '#7d7590', {cwd});
    /** @param {string} slug */
    const strength = slug =>
      HUES.reduce(
        (sum, h) =>
          sum + hexToOklch(halves(slug, `--color-background-${h}`)[0]).C,
        0,
      ) / HUES.length;
    expect(strength('dusty')).toBeLessThan(strength('vivid') * 0.75);
  }, 240_000);

  it('sets chart colors from the palette, distinct and at 3:1 on the page', async () => {
    for (const [i] of ['light', 'dark'].entries()) {
      const page = halves('vivid', '--color-background-body')[i];
      const series = SERIES.map(
        h => halves('vivid', `--color-data-categorical-${h}`)[i],
      );
      for (const c of series)
        expect(contrast(c, page)).toBeGreaterThanOrEqual(3);
      for (let a = 0; a < series.length; a++)
        for (let b = a + 1; b < series.length; b++)
          expect(perceptualDelta(series[a], series[b])).toBeGreaterThanOrEqual(
            2,
          );
    }
    expect(css('vivid')).toMatch(/--color-data-blue-1: light-dark\(/);
  });

  it('lets an exact category setting win', async () => {
    await themeEditSet('vivid', '--color-background-blue', '#ffeeaa', {
      cwd,
      mode: 'light',
    });
    expect(halves('vivid', '--color-background-blue')[0]).toBe('#ffeeaa');
  }, 240_000);

  it('says what moved in one line each, not one line per value', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('vivid', 'accent', '#d97706', {cwd})
    );
    const lines = /** @type {string[]} */ (r.data.changedTokens);
    expect(lines.some(l => /^--color-(?:background|text)-blue\b/.test(l))).toBe(
      false,
    );
    expect(lines.some(l => /^--color-data-/.test(l))).toBe(false);
    expect(
      lines.filter(l => /moved with the look$/.test(l)).length,
    ).toBeGreaterThan(0);
  }, 240_000);

  it('keeps the base theme’s category colors when the look would draw two hues alike, and says so', async () => {
    await themeEditNew('calm', {cwd, like: 'neutral'});
    await themeEditSet('calm', 'accent', '#8a8f94', {cwd});
    const before = halves('calm', '--color-background-red');
    await themeEditSet('calm', 'vibrancy', '0', {cwd});
    const r = /** @type {any} */ (await themeEditShow('calm', {cwd}));
    const notes = /** @type {string[]} */ (r.data.colorNotes);
    expect(
      notes.some(n =>
        /^category colors \(badges, tokens and card tints\) keep the base theme's: your look would draw .* alike/.test(
          n,
        ),
      ),
    ).toBe(true);
    // Core's red, not a gray.
    expect(
      hexToOklch(halves('calm', '--color-background-red')[0]).C,
    ).toBeGreaterThan(0.04);
    expect(before).not.toEqual(halves('calm', '--color-background-red'));
  }, 240_000);
});
