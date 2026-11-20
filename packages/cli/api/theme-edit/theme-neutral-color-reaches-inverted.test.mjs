// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The neutral color reaches the inverted surface tooltips and toasts
 * draw on: the card surface of the other mode, from the neutral color's own
 * shades, in both modes, with the on-dark and on-light text from the same
 * shades.
 */

import fs from 'node:fs';
import path from 'node:path';
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest';
import {themeEditNew, themeEditSet} from './theme-edit.mjs';
import {mappingRows} from './_palette.mjs';
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

beforeAll(async () => {
  cwd = makeLinkedFixture(
    'astryx-theme-neutral-color-reaches-inverted-',
    FIXTURE_PACKAGES,
  );
  const unbuilt = await installRealBaseThemes(cwd, ['neutral']);
  if (unbuilt) throw new Error(unbuilt);
  await themeEditNew('nz', {cwd, like: 'neutral'});
  await themeEditSet('nz', 'neutral', '#00aa2a', {cwd});
  await themeEditNew('nd', {cwd, like: 'neutral'});
  await themeEditSet('nd', 'mode', 'dark-only', {cwd});
  await themeEditSet('nd', 'neutral', '#00aa2a', {cwd});
}, 600_000);

afterAll(() => {
  if (cwd) removeLinkedFixture(cwd);
});

/**
 * A page token's value in a theme's built CSS, as `[light, dark]`.
 * @param {string} slug @param {string} token
 * @returns {[string, string] | null}
 */
const valueOf = (slug, token) => {
  const css = fs.readFileSync(
    path.join(cwd, 'themes', slug, `${slug}.css`),
    'utf8',
  );
  const v = new RegExp(`${token}:\\s*([^;]+);`).exec(css)?.[1]?.trim();
  if (!v) return null;
  const pair = /^light-dark\(\s*([^,]+?)\s*,\s*([^)]+?)\s*\)$/.exec(v);
  return pair ? [pair[1], pair[2]] : [v, v];
};

describe('the neutral color and the inverted surface', () => {
  it('is the card surface of the other mode, inside the neutral ramp', () => {
    const card = valueOf('nz', '--color-background-card');
    const inverted = valueOf('nz', '--color-background-inverted');
    expect(card).not.toBeNull();
    // Light: the dark card shade (inside the ramp already), green, never
    // Core's own blue-gray.
    expect(inverted?.[0]).toBe(card?.[1]);
    expect(inverted?.[0].toLowerCase()).not.toBe('#0a1317');
    // Dark: the light card is the ramp's white end, so the shade next to it,
    // which carries the neutral color: never Core's pure white.
    expect(inverted?.[1].toLowerCase()).not.toBe('#ffffff');
    expect(inverted?.[1]).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it('gives the text on it the neutral shades too', () => {
    const onLight = valueOf('nz', '--color-on-light');
    expect(onLight).not.toBeNull();
    expect(onLight?.[0].toLowerCase()).not.toBe('#111111');
    expect(valueOf('nz', '--color-on-dark')).not.toBeNull();
  });

  it('reaches a one-mode theme', () => {
    const inverted = valueOf('nd', '--color-background-inverted');
    expect(inverted).not.toBeNull();
    expect(inverted?.[1].toLowerCase()).not.toBe('#ffffff');
  });

  it('names it in the neutral mapping how prints', () => {
    expect(
      mappingRows('neutral').some(r =>
        /^--color-background-inverted: .*card surface of the other mode/.test(
          r,
        ),
      ),
    ).toBe(true);
  });
});
