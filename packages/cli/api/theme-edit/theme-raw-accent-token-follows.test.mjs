// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A whole-theme --color-accent set as a token is the theme's accent: links,
 * selected rows and the accent tint grow from it as from the accent dial,
 * and a dark value of its own carries the dark shades.
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
  const text = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  const m = new RegExp(
    `${token}: light-dark\\((#[0-9a-f]{6}), (#[0-9a-f]{6})\\)`,
  ).exec(text);
  if (!m) throw new Error(`${token} is not a light-dark() pair in ${slug}`);
  return [m[1], m[2]];
};

/** The hue gap of two colors, in degrees. @param {string} a @param {string} b */
const hueGap = (a, b) =>
  Math.abs(((hexToOklch(a).H - hexToOklch(b).H + 540) % 360) - 180);

/** The tokens the accent's shades draw: the tint and links. */
const SHADES = ['--color-accent-muted', '--color-text-accent'];

beforeAll(async () => {
  cwd = makeLinkedFixture('astryx-theme-raw-accent-', FIXTURE_PACKAGES);
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

describe('a raw --color-accent token', () => {
  it('moves the tint and links as the accent dial does', async () => {
    await themeEditNew('dial', {cwd, like: 'neutral'});
    await themeEditSet('dial', 'accent', '#0d9488', {cwd});
    await themeEditNew('raw', {cwd, like: 'neutral'});
    await themeEditSet('raw', '--color-accent', '#0d9488', {cwd});
    for (const token of SHADES)
      expect(halves('raw', token), token).toEqual(halves('dial', token));
    expect(halves('raw', '--color-accent')).toEqual(['#0d9488', '#0d9488']);
  }, 240_000);

  it('set per mode, each mode grows its own shades', async () => {
    await themeEditNew('modes', {cwd, like: 'neutral'});
    await themeEditSet('modes', '--color-accent', '#0d9488', {
      cwd,
      mode: 'light',
    });
    await themeEditSet('modes', '--color-accent', '#a78bfa', {
      cwd,
      mode: 'dark',
    });
    expect(halves('modes', '--color-accent')).toEqual(['#0d9488', '#a78bfa']);
    for (const token of SHADES) {
      const [light, dark] = halves('modes', token);
      expect(hueGap(light, '#0d9488'), `${token} light`).toBeLessThan(25);
      expect(hueGap(dark, '#a78bfa'), `${token} dark`).toBeLessThan(25);
    }
  }, 240_000);

  it('set for one mode only, moves that mode only', async () => {
    await themeEditNew('darkonly', {cwd, like: 'neutral'});
    await themeEditNew('untouched', {cwd, like: 'neutral'});
    const r = /** @type {any} */ (
      await themeEditSet('darkonly', '--color-accent', '#60a5fa', {
        cwd,
        mode: 'dark',
      })
    );
    for (const token of [
      ...SHADES,
      '--color-accent',
      '--color-info',
      '--color-background-blue',
    ])
      expect(halves('darkonly', token)[0], token).toBe(
        halves('untouched', token)[0],
      );
    for (const token of SHADES)
      expect(
        hueGap(halves('darkonly', token)[1], '#60a5fa'),
        token,
      ).toBeLessThan(25);
    expect(JSON.stringify(r.data)).not.toMatch(/in light, your exact/);
  }, 240_000);

  it('leaves a theme with an accent dial to the dial', async () => {
    await themeEditNew('both', {cwd, like: 'neutral'});
    await themeEditSet('both', 'accent', '#0d9488', {cwd});
    const before = SHADES.map(token => halves('both', token));
    await themeEditSet('both', '--color-accent', '#0f766e', {cwd});
    expect(SHADES.map(token => halves('both', token))).toEqual(before);
  }, 240_000);
});
