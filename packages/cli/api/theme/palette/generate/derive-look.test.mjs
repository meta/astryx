// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The colors a palette derives beyond its own families: the hue seeds
 * and start stops match the official neutral theme, the seeds follow the
 * accent's strength, and every derived set is written: a color drawn like
 * an earlier one moves to the nearest shade apart, and a limit no shade
 * meets is a note.
 */

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {describe, expect, it} from 'vitest';
import {
  CATEGORY_HUES,
  CATEGORY_STOPS,
  CHART_SERIES,
  HUE_SEEDS,
  cvdClashes,
  deriveLookColors,
  deriveStatusColors,
  isLookFamily,
  lookSeeds,
  statusSeeds,
  tintStops,
} from './derive-look.mjs';
import {generatePaletteSet, perceptualDelta} from './generator.mjs';
import {ratioDown} from './derive-look.mjs';
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
    for (const h of CATEGORY_HUES)
      for (const role of ['background', 'border', 'icon', 'text'])
        expect(r.tokens[`--color-${role}-${h}`], `${role} ${h}`).toBeDefined();
    expect(r.tokens['--color-data-categorical-indigo']).toBeDefined();
    expect(r.tokens['--color-data-gray-5']?.family).toBe('neutral');
    // A set whose colors already stand apart and read moves none of them.
    expect(r.limits).toEqual([]);
    expect(r.moved).toEqual([]);
    expect(r.alike).toBe(false);
    expect(r.unread).toBe(false);
  });

  it('writes every category color of a look that draws hues alike, moving each to the nearest tint apart', () => {
    // Vibrancy 0 draws every hue gray.
    const {palette, stops} = grow(lookSeeds('#7c3aed'), 0);
    const r = deriveLookColors({
      palette,
      stops,
      modes: ['light', 'dark'],
      text: m => ink[m],
      grounds: m => page[m],
    });
    expect(r.badges).toBe('derived');
    for (const h of CATEGORY_HUES)
      for (const role of ['background', 'border', 'icon', 'text'])
        expect(r.tokens[`--color-${role}-${h}`], `${role} ${h}`).toBeDefined();
    expect(
      r.moved.some(n =>
        /^--color-background-\w+ takes a (?:deeper|paler) tint in (?:light|dark), apart from \w+$/.test(
          n,
        ),
      ),
    ).toBe(true);
    // Each pair is apart, or a note names it.
    for (const m of /** @type {const} */ (['light', 'dark']))
      for (const [i, a] of CATEGORY_HUES.entries())
        for (const b of CATEGORY_HUES.slice(i + 1)) {
          const fill = (/** @type {string} */ h) =>
            r.tokens[`--color-background-${h}`][m].color;
          const text = (/** @type {string} */ h) =>
            r.tokens[`--color-text-${h}`][m].color;
          // A card tint stands apart at ΔE 1.5; a badge, by its fill or its text
          // at ΔE 2.
          const tint = perceptualDelta(fill(a), fill(b));
          const apart =
            tint >= 1.5 &&
            (tint >= 2 || perceptualDelta(text(a), text(b)) >= 2);
          const noted = r.limits.some(
            n =>
              n.startsWith(`--color-background-${b} is drawn like `) &&
              n.includes(` in ${m}:`),
          );
          expect(apart || noted, `${a} and ${b} (${m})`).toBe(true);
        }
  });

  it('writes every chart series, moving one drawn like an earlier one to the nearest shade apart', () => {
    // A quiet brown look: at vibrancy 40 its orange and brown series come
    // out alike in dark.
    const set = generatePaletteSet({
      recipe: 'astryx-oklch-v2',
      vibrancy: 40,
      families: [
        {id: 'neutral', seed: '#7a5c3e', kind: 'neutral'},
        ...Object.entries(lookSeeds('#c4a073', '#7a5c3e')).map(
          ([id, seed]) => ({id, seed}),
        ),
      ],
    });
    const stops = Object.keys(set.families[0].light.colors).map(Number);
    const palette = Object.fromEntries(
      set.families.map(f => [
        f.id,
        {light: f.light.colors, dark: f.dark.colors},
      ]),
    );
    const r = deriveLookColors({
      palette,
      stops,
      modes: ['light', 'dark'],
      text: m => ink[m],
      grounds: m => page[m],
      accent: '#c4a073',
    });
    expect(r.chart).toBe('derived');
    expect(r.moved.some(n => / shade in dark, apart from /.test(n))).toBe(true);
    for (const m of /** @type {const} */ (['light', 'dark'])) {
      const series = CHART_SERIES.map(
        h => r.tokens[`--color-data-categorical-${h}`]?.[m].color,
      );
      for (const c of series) expect(c, m).toBeDefined();
      for (let a = 0; a < series.length; a++)
        for (let b = a + 1; b < series.length; b++)
          expect(
            perceptualDelta(String(series[a]), String(series[b])),
            `${CHART_SERIES[a]} and ${CHART_SERIES[b]} (${m})`,
          ).toBeGreaterThanOrEqual(2);
    }
  });

  it('writes a chart series it cannot set apart or make readable, and notes it', () => {
    // Two stops; brown's ramp is orange's single shade, and teal's is too
    // pale to read.
    const stops = [40, 50];
    /** @param {string} a @param {string} b */
    const ramp = (a, b) => ({light: {40: a, 50: b}, dark: {40: a, 50: b}});
    const shades = {
      blue: ['#1f4fb0', '#2a5cc4'],
      orange: ['#a8551a', '#a8551a'],
      purple: ['#6a2aa0', '#7634ae'],
      green: ['#2c6e2f', '#357a38'],
      pink: ['#a0255e', '#ad2f69'],
      cyan: ['#0e6274', '#156c7f'],
      red: ['#a8242b', '#b42d34'],
      teal: ['#e6eeec', '#f0f4f3'],
      brown: ['#a8551a', '#a8551a'],
      indigo: ['#3d43b8', '#4850c4'],
    };
    const palette = Object.fromEntries(
      Object.entries(shades).map(([h, [a, b]]) => [h, ramp(a, b)]),
    );
    const r = deriveLookColors({
      palette,
      stops,
      modes: ['light'],
      text: m => ink[m],
      grounds: m => page[m],
    });
    expect(r.chart).toBe('derived');
    expect(r.alike).toBe(true);
    expect(r.unread).toBe(true);
    for (const h of CHART_SERIES)
      expect(r.tokens[`--color-data-categorical-${h}`], h).toBeDefined();
    expect(
      r.limits.some(n =>
        /^--color-data-categorical-brown is drawn like orange in light/.test(n),
      ),
    ).toBe(true);
    expect(
      r.limits.filter(n =>
        /^--color-data-categorical-teal reads at only [\d.]+:1 in light/.test(
          n,
        ),
      ),
    ).toHaveLength(1);
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

  it('keeps each status role at its own hue, whatever the accent', () => {
    const base = {info: '#0074e2', danger: '#c9303a'};
    const near = statusSeeds(base, '#0052cc');
    const far = statusSeeds(base, '#7c3aed');
    const gap = (/** @type {string} */ a, /** @type {string} */ b) =>
      Math.abs(((hexToOklch(a).H - hexToOklch(b).H + 540) % 360) - 180);
    // An accent of the role's own hue moves it no more than one far from it.
    expect(gap(near.info, base.info)).toBeLessThan(2);
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

  it('never leaves a card tint on the page unnoted', () => {
    const grounds = {
      light: ['#f1f1f1', '#ffffff'],
      dark: ['#1b1b1b', '#242424'],
    };
    for (const accent of ['#8a8f94', '#7c3aed'])
      for (const vibrancy of [0, 5]) {
        const {palette, stops} = grow(lookSeeds(accent), vibrancy);
        const r = deriveLookColors({
          palette,
          stops,
          modes: ['light', 'dark'],
          text: m => ink[m],
          grounds: m => grounds[m],
        });
        for (const m of /** @type {const} */ (['light', 'dark']))
          for (const h of CATEGORY_HUES) {
            const fill = r.tokens[`--color-background-${h}`][m].color;
            const onPage = grounds[m].some(g => perceptualDelta(g, fill) < 1.5);
            const noted = r.limits.some(
              n =>
                n.startsWith(`--color-background-${h} is drawn like `) &&
                n.includes(` in ${m}:`),
            );
            expect(
              !onPage || noted,
              `${h} (${m}, ${accent} at ${vibrancy})`,
            ).toBe(true);
          }
      }
  });

  it('keeps the badge fills of a very quiet look apart, or names the ones it cannot', () => {
    for (const vibrancy of [5, 10]) {
      const {palette, stops} = grow(lookSeeds('#7c3aed'), vibrancy);
      const r = deriveLookColors({
        palette,
        stops,
        modes: ['light', 'dark'],
        text: m => ink[m],
        grounds: m => page[m],
      });
      for (const m of /** @type {const} */ (['light', 'dark']))
        for (const [i, a] of CATEGORY_HUES.entries())
          for (const b of CATEGORY_HUES.slice(i + 1)) {
            const fill = (/** @type {string} */ h) =>
              r.tokens[`--color-background-${h}`][m].color;
            const text = (/** @type {string} */ h) =>
              r.tokens[`--color-text-${h}`][m].color;
            // A card tint stands apart at ΔE 1.5; a badge, by its fill or its text
            // at ΔE 2.
            const tint = perceptualDelta(fill(a), fill(b));
            const apart =
              tint >= 1.5 &&
              (tint >= 2 || perceptualDelta(text(a), text(b)) >= 2);
            const noted = r.limits.some(
              n =>
                n.startsWith(`--color-background-${b} is drawn like `) &&
                n.includes(` in ${m}:`),
            );
            expect(apart || noted, `${a} and ${b} (${m}, ${vibrancy})`).toBe(
              true,
            );
          }
    }
  });

  it('keeps the base colors of a status role whose text reads at no shade, with a note', () => {
    // A pale family: no fill stands out from the page, and no text reads.
    const stops = [10, 30, 50, 70, 90];
    const pale = Object.fromEntries(stops.map(s => [s, '#d0d0d0']));
    const white = {stop: 100, color: '#ffffff', family: 'white'};
    const black = {stop: 0, color: '#000000', family: 'black'};
    const r = deriveStatusColors({
      palette: {info: {light: pale, dark: pale}},
      stops,
      modes: ['light'],
      roles: ['info'],
      grounds: m => page[m],
      inks: () => [white, black],
      accent: () => null,
    });
    expect(r.roles).toEqual({});
    expect(Object.keys(r.tokens)).toEqual([]);
    expect(r.short).toEqual(['info']);
    expect(r.why).toEqual([
      "info keeps the base theme's colors: no shade of its family reads",
    ]);
  });

  it('writes a status role whose fill gives up a limit, and notes it', () => {
    // A mid family: its fill reads with white text, but sits on the accent.
    const stops = [10, 30, 50, 70, 90];
    const mid = {
      10: '#0b1f4d',
      30: '#1d3f8f',
      50: '#2f5fd0',
      70: '#8fb0f0',
      90: '#e3ecfc',
    };
    const white = {stop: 100, color: '#ffffff', family: 'white'};
    const black = {stop: 0, color: '#000000', family: 'black'};
    const r = deriveStatusColors({
      palette: {info: {light: mid, dark: mid}},
      stops,
      modes: ['light'],
      roles: ['info'],
      grounds: m => page[m],
      inks: () => [white, black],
      accent: () => '#2f5fd0',
    });
    expect(r.roles).toEqual({info: 'derived'});
    expect(r.tokens['--color-info']).toBeDefined();
    expect(r.why.join(' ')).not.toMatch(/keeps the base theme's colors/);
  });

  it("keys the hues to the look's accent and neutral, not only its strength", () => {
    const navyOnGray = lookSeeds('#000080', '#808080');
    const blueOnSlate = lookSeeds('#0052cc', '#6b778c');
    const turned = Object.keys(navyOnGray).filter(
      h => navyOnGray[h] !== blueOnSlate[h],
    );
    expect(turned.length).toBeGreaterThanOrEqual(5);
    // Every grown hue stays its own family: the turn is a few degrees.
    for (const [h, seed] of Object.entries(blueOnSlate))
      expect(isLookFamily({id: h, name: h, seed}), h).toBe(true);
  });

  it('draws card tints deeper for a dark or strong accent, paler for a pale one', () => {
    expect(tintStops('#000080')[0]).toBeLessThan(tintStops('#0052cc')[0]);
    expect(tintStops('#a7c7e7')[0]).toBeGreaterThan(tintStops('#0052cc')[0]);
    expect(tintStops(null)).toEqual(tintStops('#808080'));
  });

  it('finds status fills a red-weak or green-weak reader may not tell apart', () => {
    // The official neutral theme's status fills stay apart.
    expect(
      cvdClashes({
        info: '#0074e2',
        success: '#198100',
        warning: '#ffce2f',
        error: '#c9303a',
      }),
    ).toEqual([]);
    // A muddy warning beside a mid green does not.
    const found = cvdClashes({success: '#357d2b', warning: '#8a6d00'});
    expect(found.map(c => c.vision).sort()).toEqual(['green-weak', 'red-weak']);
  });
});

describe("an unreadable tint's ratio", () => {
  it('is cut down, never rounded up to the bar', () => {
    expect(ratioDown(4.497)).toBe(4.49);
    expect(ratioDown(4.497)).toBeLessThan(4.5);
    expect(ratioDown(4.5)).toBe(4.5);
  });
});

describe("code colors on the theme's own code background", () => {
  it('read at 4.5:1 on a code background the theme sets itself', async () => {
    const {deriveCodeColors} = await import('./derive-look.mjs');
    const {contrastRatio} = await import('./color.mjs');
    const {palette, stops} = grow(lookSeeds('#5b3cc4'));
    const dark = '#1e1e1e';
    const {tokens} = deriveCodeColors({
      palette,
      stops,
      modes: ['light', 'dark'],
      grounds: m => page[m],
      codeGround: m => (m === 'dark' ? dark : null),
      wanted: k => k !== '--color-syntax-background',
    });
    const keyword = tokens['--color-syntax-keyword'];
    expect(keyword).toBeDefined();
    expect(contrastRatio(keyword.dark.color, dark)).toBeGreaterThanOrEqual(4.5);
  });
});
