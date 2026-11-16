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
  PALETTE_RECIPE_V3,
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

  it('v2 fades a gray family toward white as a gray scale does; v1 keeps it', () => {
    /** @param {string} recipe */
    const gray = recipe =>
      generatePaletteSet({
        recipe,
        families: [{id: 'neutral', seed: '#64748b', kind: 'neutral'}],
        neutralProfile: 'custom',
      }).families[0].light.colors;
    const v1 = gray(PALETTE_RECIPE);
    const v2 = gray(PALETTE_RECIPE_V2);
    // A slate's page shade keeps about a sixth of its color, not half.
    expect(hexToOklch(v2[95]).C).toBeLessThan(0.01);
    expect(hexToOklch(v1[95]).C).toBeGreaterThan(0.015);
    // Its darker shades keep their color.
    expect(v2[50]).toBe(v1[50]);
    expect(v2[30]).toBe(v1[30]);
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

  it("v3 keeps a dusty seed's pale tints at or below its own chroma, where its gamut is wide", () => {
    // A muted olive: yellow-greens hold a lot of chroma when pale, so the
    // tint is not shared, and coordination must not raise it to chartreuse.
    const olive = '#66662e';
    const seed = hexToOklch(olive).C;
    const v3 = ramp(olive, 50, PALETTE_RECIPE_V3).families[0].light.colors;
    const v2 = ramp(olive, 50, PALETTE_RECIPE_V2).families[0].light.colors;
    for (const stop of [85, 90, 95])
      expect(hexToOklch(v3[stop]).C, `stop ${stop}`).toBeLessThanOrEqual(seed);
    // v2 stays as it shipped: it draws the tint above its middle stronger.
    expect(hexToOklch(v2[85]).C).toBeGreaterThan(seed);
    // The middle of the ramp is still v2's (and so v1's).
    for (const stop of [30, 50, 70]) expect(v3[stop]).toBe(v2[stop]);
  });

  it('v2 draws exactly what it first shipped with', () => {
    // The ramps v2 drew when it first shipped: a recipe never changes once
    // released, so a palette that names it keeps its colors.
    const SHIPPED = {
      '#66662e@50': {
        light: '#979637,#b2b14c,#bfbf61,#cccd76,#d9da8c,#e7e8a5,#f4f5c0',
        dark: '#343300,#3f3e00,#4b4a00',
      },
      '#2563eb@50': {
        light: '#528aff,#85abf3,#a2b9e6,#b6c7e7,#c8d5ed,#dae3f3,#edf1f9',
        dark: '#072872,#0e3384,#173f96',
      },
      '#c2603d@30': {
        light: '#d07454,#ea9172,#eda58c,#debfb4,#e2d0ca,#ece0db,#f5efed',
        dark: '#531d07,#63260f,#723018',
      },
      '#16a34a@80': {
        light: '#20ac51,#5ac574,#74d188,#8ddc9c,#a5e7b1,#bcf3c5,#d4feda',
        dark: '#003c14,#00491b,#005621',
      },
      '#777777@50': {
        light: '#919191,#ababab,#b9b9b9,#c6c6c6,#d4d4d4,#e2e2e2,#f1f1f1',
        dark: '#303030,#3b3b3b,#474747',
      },
    };
    for (const [key, want] of Object.entries(SHIPPED)) {
      const [seed, vibrancy] = key.split('@');
      const f = generatePaletteSet({
        recipe: PALETTE_RECIPE_V2,
        vibrancy: Number(vibrancy),
        families: [
          {id: 'f', seed, ...(seed === '#777777' ? {kind: 'neutral'} : {})},
        ],
      }).families[0];
      expect(
        [60, 70, 75, 80, 85, 90, 95].map(s => f.light.colors[s]).join(','),
        key,
      ).toBe(want.light);
      expect([20, 25, 30].map(s => f.dark.colors[s]).join(','), key).toBe(
        want.dark,
      );
    }
  });

  it('refuses a recipe it does not know, naming the ones it does', () => {
    expect(() => ramp(VIVID, 50, 'astryx-oklch-v9')).toThrow(
      /Unknown palette recipe: astryx-oklch-v9 \(known: astryx-oklch-v1, astryx-oklch-v2, astryx-oklch-v3\)/,
    );
  });
});
