// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The palette recipes: a request that names no recipe runs
 * astryx-oklch-v1 and regenerates exactly what v1 made; astryx-oklch-v2
 * runs only when named, with the same result shape, and its pale stops
 * follow the vibrancy and the seed's own chroma.
 */

import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';
import {
  PALETTE_RECIPE,
  PALETTE_RECIPE_V2,
  generatePaletteSet,
} from './generator.mjs';
import {hexToOklch} from './color.mjs';

const DUSTY = '#5f7891';
const VIVID = '#2563eb';

/** @param {string} seed @param {number} vibrancy @param {string} [recipe] */
const ramp = (seed, vibrancy, recipe) =>
  generatePaletteSet({
    ...(recipe ? {recipe} : {}),
    vibrancy,
    families: [{id: 'f', seed}],
  });

/** @param {any} result @param {number} stop */
const chromaAt = (result, stop) =>
  hexToOklch(result.families[0].light.colors[stop]).C;

describe('palette recipes', () => {
  it('a request that names no recipe runs v1, and regenerates what v1 made', () => {
    for (const seed of [DUSTY, VIVID])
      for (const vibrancy of [20, 50, 80]) {
        const none = ramp(seed, vibrancy);
        const v1 = ramp(seed, vibrancy, PALETTE_RECIPE);
        expect(none.recipe).toBe('astryx-oklch-v1');
        expect(none.families).toEqual(v1.families);
      }
  });

  it('a shipped config with its recipe left out regenerates the same colors', () => {
    const file = path.resolve(
      import.meta.dirname,
      '../../../../../themes/neutral/palette.config.json',
    );
    const named = JSON.parse(fs.readFileSync(file, 'utf8'));
    expect(named.recipe).toBe('astryx-oklch-v1');
    const {recipe: _, ...none} = named;
    expect(generatePaletteSet(none).families).toEqual(
      generatePaletteSet(named).families,
    );
  });

  it('v2 runs only when named, with the same result shape', () => {
    const v1 = ramp(VIVID, 50, PALETTE_RECIPE);
    const v2 = ramp(VIVID, 50, PALETTE_RECIPE_V2);
    expect(v2.recipe).toBe('astryx-oklch-v2');
    expect(Object.keys(v2)).toEqual(Object.keys(v1));
    expect(Object.keys(v2.families[0].light)).toEqual(
      Object.keys(v1.families[0].light),
    );
  });

  it('v2 pale stops follow the vibrancy', () => {
    for (const seed of [DUSTY, VIVID])
      for (const stop of [85, 90]) {
        const [low, mid, high] = [20, 50, 80].map(v =>
          chromaAt(ramp(seed, v, PALETTE_RECIPE_V2), stop),
        );
        expect(low, `${seed} ${stop}`).toBeLessThan(mid);
        expect(mid, `${seed} ${stop}`).toBeLessThan(high);
      }
  });

  it('v2 keeps a dusty seed dustier than a vivid one in its pale stops', () => {
    for (const stop of [80, 85, 90])
      expect(chromaAt(ramp(DUSTY, 50, PALETTE_RECIPE_V2), stop)).toBeLessThan(
        chromaAt(ramp(VIVID, 50, PALETTE_RECIPE_V2), stop),
      );
  });

  it('refuses a recipe it does not know, naming the ones it does', () => {
    expect(() => ramp(VIVID, 50, 'astryx-oklch-v9')).toThrow(
      /Unknown palette recipe: astryx-oklch-v9 \(known: astryx-oklch-v1, astryx-oklch-v2\)/,
    );
  });
});
