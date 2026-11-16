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

  it('v2 draws the stops it does not share exactly as v1, for a dusty and a vivid seed', () => {
    // A stop whose gamut holds the most vivid seed at the default vibrancy
    // is not shared: orange's stops from 50 up, green's from 40 up.
    for (const [seed, from] of /** @type {const} */ ([
      ['#c2603d', 50],
      ['#16a34a', 40],
    ]))
      for (const vibrancy of [20, 50, 80]) {
        const v1 = ramp(seed, vibrancy, PALETTE_RECIPE).families[0].light
          .colors;
        const v2 = ramp(seed, vibrancy, PALETTE_RECIPE_V2).families[0].light
          .colors;
        for (const stop of [50, 55, 60, 65, 70].filter(x => x >= from))
          expect(v2[stop], `${seed} @${vibrancy} stop ${stop}`).toBe(v1[stop]);
      }
    // The stops it shares still keep a dusty seed dusty.
    expect(chromaAt(ramp(DUSTY, 50, PALETTE_RECIPE_V2), 95)).toBeLessThan(
      chromaAt(ramp(DUSTY, 50, PALETTE_RECIPE), 95),
    );
  });

  it('v2 never shares the dark side: every stop up to the middle is v1, for the shipped seeds and vivid and dull ones', () => {
    const shipped = fs
      .readdirSync(path.resolve(import.meta.dirname, '../../../../../themes'))
      .map(t =>
        path.resolve(
          import.meta.dirname,
          '../../../../../themes',
          t,
          'palette.config.json',
        ),
      )
      .filter(f => fs.existsSync(f))
      .flatMap(f =>
        /** @type {{families: Array<{seed: string}>}} */ (
          JSON.parse(fs.readFileSync(f, 'utf8'))
        ).families.map(x => x.seed),
      );
    expect(shipped.length).toBeGreaterThan(6);
    for (const seed of [
      ...shipped,
      '#f59e0b',
      '#ff0000',
      '#00ff00',
      '#2563eb',
      '#5f7891',
      '#8a7470',
    ])
      for (const vibrancy of [20, 50, 80]) {
        const v1 = ramp(seed, vibrancy, PALETTE_RECIPE).families[0];
        const v2 = ramp(seed, vibrancy, PALETTE_RECIPE_V2).families[0];
        for (const mode of /** @type {const} */ (['light', 'dark']))
          for (const stop of Object.keys(v1[mode].colors)
            .map(Number)
            .filter(x => x <= 50))
            expect(
              v2[mode].colors[stop],
              `${seed} @${vibrancy} ${mode} ${stop}`,
            ).toBe(v1[mode].colors[stop]);
      }
  });

  it("an amber warning's text shade keeps v1's strength", () => {
    const amber = (/** @type {string} */ recipe) =>
      ramp('#f59e0b', 50, recipe).families[0].light.colors[35];
    expect(amber(PALETTE_RECIPE_V2)).toBe(amber(PALETTE_RECIPE));
    expect(hexToOklch(amber(PALETTE_RECIPE_V2)).C).toBeGreaterThan(0.09);
  });

  it('refuses a recipe it does not know, naming the ones it does', () => {
    expect(() => ramp(VIVID, 50, 'astryx-oklch-v9')).toThrow(
      /Unknown palette recipe: astryx-oklch-v9 \(known: astryx-oklch-v1, astryx-oklch-v2\)/,
    );
  });
});
