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
import {hexToOklch} from '../theme/palette/generate/color.mjs';
import {parseColor, ratio} from './_color.mjs';
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
const light = (slug, token) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  // (One color for both modes, or a light-dark() pair's light half.)
  return new RegExp(`${token}: (?:light-dark\\()?(#[0-9a-f]{6})`).exec(
    css,
  )?.[1];
};

/**
 * The OKLCH hue difference weighted by chroma, ΔH = 2·√(C1·C2)·sin(Δh/2):
 * a hue angle means little on a pale tint (its 8-bit color moves the
 * angle by degrees at chroma 0.026), so the difference is read as the
 * distance the hue moves the color, one bar for every stop.
 * @param {string} a @param {string} b
 */
const hueDifference = (a, b) => {
  const [x, y] = [hexToOklch(a), hexToOklch(b)];
  const dh = ((((x.H - y.H + 540) % 360) - 180) * Math.PI) / 180;
  return 2 * Math.sqrt(x.C * y.C) * Math.abs(Math.sin(dh / 2));
};
/**
 * The most a status color's hue may move: 1° at full chroma (C 0.17, a
 * ΔH of 0.003) is within it; the 24° an accent once turned the warning
 * (ΔH 0.054) is ten times over it.
 */
const HUE_BAR = 0.005;

/** @param {string} a @param {string} b */
const contrast = (a, b) =>
  ratio(
    /** @type {[number, number, number]} */ (parseColor(a)),
    /** @type {[number, number, number]} */ (parseColor(b)),
  );

const T = 300_000;

describe('status colors the look grows', () => {
  for (const [slug, accent] of [
    ['w', '#0052cc'],
    // (An amber or yellow accent sits by the warning's own fill: the fill
    // moves apart from it and stays a visible fill, its tint paler.)
    ['amber', '#fbbf24'],
    ['y1', '#ffce2f'],
    ['y2', '#f5c518'],
    ['y3', '#ffe082'],
  ])
    it(
      `keeps the warning tint apart from the warning fill in light mode, with a ${accent} accent`,
      async test => {
        needsBases(test);
        await themeEditNew(slug, {cwd, like: 'neutral'});
        await themeEditSet(slug, 'accent', accent, {cwd});
        const fill = light(slug, '--color-warning');
        const tint = light(slug, '--color-warning-muted');
        expect(fill).toBeTruthy();
        expect(tint).toBeTruthy();
        expect(tint).not.toBe(fill);
        // (The fill stands out from the light page as the base theme's
        // own warning does, never a near-white.)
        const page = String(light(slug, '--color-background-body'));
        expect(
          contrast(String(fill), page),
          `${fill} on ${page}`,
        ).toBeGreaterThanOrEqual(1.2);
        // (Both keep the warning's own hue, whatever the accent.)
        await themeEditNew(`${slug}-plain`, {cwd, like: 'neutral'});
        const own = String(light(`${slug}-plain`, '--color-warning'));
        for (const c of [fill, tint])
          expect(hueDifference(String(c), own), `${c} hue`).toBeLessThan(
            HUE_BAR,
          );
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
