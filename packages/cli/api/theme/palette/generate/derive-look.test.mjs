// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The colors a palette derives beyond its own families: the hue seeds
 * and start stops match the official neutral theme, the seeds follow the
 * accent's strength, and a set that draws two hues alike is refused.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  CATEGORY_HUES,
  CATEGORY_STOPS,
  HUE_SEEDS,
  deriveLookColors,
  deriveStatusColors,
  isLookFamily,
  lookSeeds,
  statusSeeds,
} from './derive-look.mjs';
import {generatePaletteSet, perceptualDelta} from './generator.mjs';
import {hexToOklch} from './color.mjs';

const THEMES = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../../../themes',
);

/** A palette grown from the look's seeds, keyed by family id. @param {Record<string, string>} seeds @param {number} [vibrancy] */
const grow = (seeds, vibrancy = 50) => {
  const set = generatePaletteSet({
    recipe: 'astryx-oklch-v2',
    vibrancy,
    families: [
      {id: 'neutral', seed: '#777777', kind: 'neutral'},
      ...Object.entries(seeds).map(([id, seed]) => ({id, seed})),
    ],
  });
  return {
    stops: Object.keys(set.families[0].light.colors).map(Number),
    palette: Object.fromEntries(
      set.families.map(f => [
        f.id,
        {light: f.light.colors, dark: f.dark.colors},
      ]),
    ),
  };
};

const ink = {light: ['#1b1b1b', '#474747'], dark: ['#f2f2f2', '#b9b9b9']};
const page = {light: ['#f2f2f2', '#ffffff'], dark: ['#1a1a1a', '#242424']};

describe('derived look colors', () => {
  it('grows from the official neutral palette’s own category seeds', () => {
    const config = JSON.parse(
      fs.readFileSync(path.join(THEMES, 'neutral/palette.config.json'), 'utf8'),
    );
    for (const f of config.families)
      if (f.id !== 'neutral') expect(HUE_SEEDS[f.id], f.id).toBe(f.seed);
  });

  it('starts each token where the official neutral theme maps it', () => {
    const source = fs.readFileSync(
      path.join(THEMES, 'neutral/src/neutralTheme.ts'),
      'utf8',
    );
    /** @param {string} token */
    const stops = token => {
      const m = new RegExp(
        `'${token}': \\[\\w+\\.\\w+\\[(\\d+)\\], \\w+\\.\\w+\\[(\\d+)\\]\\]`,
      ).exec(source);
      return m ? [Number(m[1]), Number(m[2])] : null;
    };
    expect(stops('--color-background-blue')).toEqual(CATEGORY_STOPS.background);
    expect(stops('--color-border-blue')).toEqual(CATEGORY_STOPS.border);
    expect(stops('--color-icon-blue')).toEqual(CATEGORY_STOPS.icon);
    expect(stops('--color-text-blue')).toEqual(CATEGORY_STOPS.text);
    expect(stops('--color-background-gray')).toEqual(
      CATEGORY_STOPS.grayBackground,
    );
    expect(stops('--color-border-gray')).toEqual(CATEGORY_STOPS.grayBorder);
    expect(stops('--color-icon-gray')).toEqual(CATEGORY_STOPS.grayIcon);
    expect(stops('--color-text-gray')).toEqual(CATEGORY_STOPS.grayText);
  });

  it('takes the accent’s strength, keeping Core’s lightness and hue', () => {
    const dusty = lookSeeds('#7d7590');
    const core = lookSeeds(null);
    // Without a colored accent, Core's own strength.
    expect(hexToOklch(core.blue).C).toBeCloseTo(
      hexToOklch(HUE_SEEDS.blue).C,
      2,
    );
    for (const h of Object.keys(HUE_SEEDS)) {
      const a = hexToOklch(dusty[h]);
      const b = hexToOklch(HUE_SEEDS[h]);
      expect(a.C, h).toBeLessThan(b.C);
      expect(Math.abs(a.L - b.L), h).toBeLessThan(0.02);
      expect(isLookFamily({id: h, name: h, seed: dusty[h]}), h).toBe(true);
    }
    // An accent of about the same strength leaves the seeds as they are.
    expect(lookSeeds('#0e7490')).toEqual(lookSeeds('#0f7591'));
    // A family the author wrote, or with anchors, is the author's.
    expect(isLookFamily({id: 'blue', name: 'Blue', seed: '#ff00aa'})).toBe(
      false,
    );
    expect(
      isLookFamily({id: 'blue', name: 'Blue', seed: core.blue, anchors: []}),
    ).toBe(false);
  });

  it('derives readable, distinct category and chart colors', () => {
    const {palette, stops} = grow(lookSeeds('#7c3aed'));
    const r = deriveLookColors({
      palette,
      stops,
      modes: ['light', 'dark'],
      text: m => ink[m],
      grounds: m => page[m],
    });
    expect(r.badges).toBe('derived');
    expect(r.chart).toBe('derived');
    expect(r.unreadable).toEqual([]);
    for (const h of CATEGORY_HUES)
      for (const role of ['background', 'border', 'icon', 'text'])
        expect(r.tokens[`--color-${role}-${h}`], `${role} ${h}`).toBeDefined();
    expect(r.tokens['--color-data-categorical-indigo']).toBeDefined();
    expect(r.tokens['--color-data-gray-5']?.family).toBe('neutral');
  });

  it('refuses a set that draws two hues alike, and writes none of it', () => {
    const {palette, stops} = grow(lookSeeds('#7c3aed'), 0);
    const r = deriveLookColors({
      palette,
      stops,
      modes: ['light', 'dark'],
      text: m => ink[m],
      grounds: m => page[m],
    });
    expect(r.badges).toBe('merged');
    expect(r.merged.length).toBeGreaterThan(0);
    expect(
      Object.keys(r.tokens).some(k => k.startsWith('--color-background-')),
    ).toBe(false);
  });

  it('leaves a token the theme sets by hand', () => {
    const {palette, stops} = grow(lookSeeds('#7c3aed'));
    const r = deriveLookColors({
      palette,
      stops,
      modes: ['light', 'dark'],
      text: m => ink[m],
      grounds: m => page[m],
      wanted: k => k !== '--color-background-blue',
    });
    expect(r.tokens['--color-background-blue']).toBeUndefined();
    expect(r.tokens['--color-text-blue']).toBeDefined();
  });

  it('turns a status role away from an accent of its hue, keeping its family', () => {
    const base = {info: '#0074e2', danger: '#c9303a'};
    const near = statusSeeds(base, '#0052cc');
    const far = statusSeeds(base, '#7c3aed');
    const gap = (/** @type {string} */ a, /** @type {string} */ b) =>
      Math.abs(((hexToOklch(a).H - hexToOklch(b).H + 540) % 360) - 180);
    expect(gap(near.info, '#0052cc')).toBeGreaterThanOrEqual(29);
    expect(gap(near.info, base.info)).toBeLessThanOrEqual(40);
    expect(gap(far.info, base.info)).toBeLessThan(2);
    expect(gap(near.danger, base.danger)).toBeLessThan(2);
  });

  it('derives readable status colors apart from the accent', () => {
    const seeds = statusSeeds(
      {
        info: '#0074e2',
        success: '#198100',
        warning: '#ffce2f',
        danger: '#c9303a',
      },
      '#0052cc',
    );
    const {palette, stops} = grow(seeds);
    const white = {stop: 100, color: '#ffffff', family: 'white'};
    const black = {stop: 0, color: '#000000', family: 'black'};
    const r = deriveStatusColors({
      palette,
      stops,
      modes: ['light', 'dark'],
      roles: ['info', 'success', 'warning', 'danger'],
      grounds: m => page[m],
      inks: (m, id) =>
        id === 'warning' || m === 'dark' ? [black, white] : [white, black],
      accent: m => (m === 'light' ? '#0052cc' : '#7aabff'),
    });
    expect(r.roles).toEqual({
      info: 'derived',
      success: 'derived',
      warning: 'derived',
      danger: 'derived',
    });
    expect(r.tokens['--color-on-warning'].light.family).toBe('black');
    expect(r.tokens['--color-error']).toBeDefined();
    // A role whose fill would be drawn like the accent takes the nearest
    // stop that stands apart from it instead.
    const taken = r.tokens['--color-info'].light.color;
    const apart = deriveStatusColors({
      palette,
      stops,
      modes: ['light'],
      roles: ['info'],
      grounds: m => page[m],
      inks: () => [white, black],
      accent: () => taken,
    });
    expect(apart.roles.info).toBe('derived');
    expect(
      perceptualDelta(apart.tokens['--color-info'].light.color, taken),
    ).toBeGreaterThanOrEqual(10);
  });
});
