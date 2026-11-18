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

/**
 * A token's half as it shows over a page color: a see-through value
 * (`#rrggbbaa`) composited over it.
 * @param {string} slug @param {string} token @param {number} i @param {string} page
 */
const seen = (slug, token, i, page) => {
  const m = new RegExp(
    `${token}: light-dark\\((#[0-9a-f]{6,8}), (#[0-9a-f]{6,8})\\)`,
  ).exec(css(slug));
  if (!m) throw new Error(`${token} is not a light-dark() pair in ${slug}`);
  const v = m[1 + i];
  if (v.length === 7) return v;
  const a = parseInt(v.slice(7), 16) / 255;
  const ch = (/** @type {string} */ c, /** @type {number} */ k) =>
    parseInt(c.slice(1 + k * 2, 3 + k * 2), 16);
  return `#${[0, 1, 2]
    .map(k =>
      Math.round(a * ch(v, k) + (1 - a) * ch(page, k))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
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

describe('status roles follow the look', () => {
  it('grows the roles a theme leaves unset, readable and apart from the accent', async () => {
    await themeEditNew('corp', {cwd, like: 'neutral'});
    await themeEditSet('corp', 'accent', '#0052cc', {cwd});
    for (const [i, mode] of /** @type {const} */ ([
      'light',
      'dark',
    ]).entries()) {
      const page = halves('corp', '--color-background-body')[i];
      const accent = halves('corp', '--color-accent')[i];
      for (const w of ['info', 'success', 'warning', 'error']) {
        const fill = halves('corp', `--color-${w}`)[i];
        const on = halves('corp', `--color-on-${w}`)[i];
        const text = halves('corp', `--color-text-${w}`)[i];
        // The dark tint is see-through: measured as it shows on the page.
        const tint = seen('corp', `--color-${w}-muted`, i, page);
        const onTint = halves('corp', `--color-on-${w}-muted`)[i];
        expect(
          contrast(on, fill),
          `${mode} text on ${w}`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(text, page),
          `${mode} ${w} text`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          contrast(onTint, tint),
          `${mode} text on ${w} tint`,
        ).toBeGreaterThanOrEqual(4.5);
        expect(
          perceptualDelta(fill, accent),
          `${mode} ${w} apart`,
        ).toBeGreaterThanOrEqual(5);
      }
    }
    // Info keeps its own hue in each mode, whatever the accent: an accent
    // of its own hue (blue) and one far from it (pink) give it the same
    // hue; it stands apart from the blue accent by its shade.
    await themeEditNew('corp-pink', {cwd, like: 'neutral'});
    await themeEditSet('corp-pink', 'accent', '#ff1493', {cwd});
    for (const [i, mode] of /** @type {const} */ ([
      'light',
      'dark',
    ]).entries()) {
      const near = hexToOklch(halves('corp', '--color-info')[i]);
      const far = hexToOklch(halves('corp-pink', '--color-info')[i]);
      expect(
        Math.abs(((near.H - far.H + 540) % 360) - 180),
        `${mode} info hue`,
      ).toBeLessThan(2);
    }
    const source = fs.readFileSync(
      path.join(cwd, 'themes', 'corp', 'corp.settings.ts'),
      'utf8',
    );
    expect(source).toMatch(/"--color-info": \[\s*palette\.info\.light\[\d+\]/);
  }, 240_000);

  it('lets a role the theme sets win, and says what the look grew', async () => {
    const r = /** @type {any} */ (
      await themeEditSet('corp', 'danger', '#9f1239', {cwd})
    );
    expect(halves('corp', '--color-error')[0]).toBe('#9f1239');
    const a = /** @type {any} */ (
      await themeEditSet('corp', 'accent', '#0050c8', {cwd})
    );
    const notes = /** @type {string[]} */ (a.data.notes);
    expect(
      notes.some(n =>
        /^info, success, warning grow from the base theme's hues/.test(n),
      ),
    ).toBe(true);
    expect(r.data.notes.join(' ')).not.toMatch(
      /keep the base theme's colors at any vibrancy/,
    );
  }, 240_000);
});
