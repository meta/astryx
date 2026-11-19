// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themePalette.test.ts
 * @input themePalette() seeds, defineTheme({palette}), random and extreme
 *   seeds, both recipes
 * @output Proof that a palette sets every color token it maps, that explicit
 *   tokens and part styles win, that no recipe means v1, that output is
 *   deterministic, and that malformed input is refused with the fix
 * @position Behavior tests for @astryxdesign/core/palette's palette input
 */

import {describe, expect, it} from 'vitest';
import {defineTheme, tokenDefaults} from '../theme/defineTheme';
import {generateThemeCSS} from '../theme/generateThemeRules';
import {resolveThemeTokens} from '../theme/tokens';
import {
  PALETTE_RECIPE,
  PALETTE_RECIPE_V2,
  generateTonalPalette,
} from './generator';
import {
  LIFT_PARTS,
  PALETTE_DIALS,
  hex,
  mapPalette,
  planPaletteRequest,
  type PaletteMappingContext,
} from './mapping';
import {parseColor} from '../utils/color';
import {themePalette} from './themePalette';
import type {ThemePaletteInput} from './types';

const HEX = /^#[0-9a-f]{6}([0-9a-f]{2})?$/;

function seeded(seed: number) {
  let state = seed;
  const next = () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
  const color = () =>
    `#${Math.floor(next() * 0xffffff)
      .toString(16)
      .padStart(6, '0')}`;
  return {next, color};
}

const DIALS = [
  'accent',
  'neutral',
  'success',
  'warning',
  'danger',
  'info',
] as const;

/** Every token a palette sets reads back from the theme in each mode. */
function expectTokensApplied(input: ThemePaletteInput, name: string) {
  const palette = themePalette(input);
  const theme = defineTheme({name, palette});
  const light = resolveThemeTokens(theme, {mode: 'light'});
  const dark = resolveThemeTokens(theme, {mode: 'dark'});
  for (const [token, [l, d]] of Object.entries(palette.tokens)) {
    expect(Object.hasOwn(tokenDefaults, token), token).toBe(true);
    expect(l, token).toMatch(HEX);
    expect(d, token).toMatch(HEX);
    expect(light[token]?.toLowerCase(), `${token} light`).toBe(l);
    expect(dark[token]?.toLowerCase(), `${token} dark`).toBe(d);
  }
  return palette;
}

describe('themePalette', () => {
  it('maps the seeds to the full color token set, status included', () => {
    const palette = expectTokensApplied(
      {
        accent: '#5b3cc4',
        neutral: '#6b6b70',
        success: '#1f8a3b',
        warning: '#e0a100',
        danger: '#d1242f',
        info: '#0a6cd6',
      },
      'palette-full',
    );
    for (const token of [
      '--color-background-body',
      '--color-background-surface',
      '--color-text-primary',
      '--color-text-secondary',
      '--color-border',
      '--color-accent',
      '--color-on-accent',
      '--color-text-accent',
      '--color-accent-muted',
      '--focus-outline-color',
      '--color-success',
      '--color-on-warning',
      '--color-text-error',
      '--color-border-info',
      '--color-info-muted',
    ]) {
      expect(palette.tokens[token], token).toBeDefined();
    }
    // The accent keeps the exact color given, as the editor anchors it.
    expect(palette.tokens['--color-accent'][0]).toBe('#5b3cc4');
    expect(palette.components.item?.selected).toBeDefined();
  });

  it('runs astryx-oklch-v1 when no recipe is named, and v2 only when named', () => {
    const seeds = {accent: '#5b3cc4', neutral: '#706a62'};
    const plain = themePalette(seeds);
    expect(plain.recipe).toBe(PALETTE_RECIPE);
    expect(plain).toEqual(themePalette({...seeds, recipe: PALETTE_RECIPE}));
    const v2 = themePalette({...seeds, recipe: PALETTE_RECIPE_V2});
    expect(v2.recipe).toBe(PALETTE_RECIPE_V2);
    expect(v2.tokens).not.toEqual(plain.tokens);
  });

  it('gives the same frozen result for the same input', () => {
    const input = {accent: '#c43c7a', info: '#2b6cb0', vibrancy: 20};
    const a = themePalette(input);
    expect(themePalette(input)).toEqual(a);
    expect(Object.isFrozen(a)).toBe(true);
    expect(Object.isFrozen(a.tokens)).toBe(true);
    expect(Object.isFrozen(a.components)).toBe(true);
    for (const [part, blocks] of Object.entries(a.components)) {
      expect(Object.isFrozen(blocks), part).toBe(true);
      for (const lift of Object.values(blocks)) {
        expect(Object.isFrozen(lift), part).toBe(true);
        expect(Object.isFrozen(lift['@light']), part).toBe(true);
      }
    }
  });

  it('builds a theme for random seeds, settings and recipes', () => {
    const {next, color} = seeded(20261116);
    for (let i = 0; i < 40; i++) {
      const input: Record<string, unknown> = {};
      for (const dial of DIALS) {
        if (next() < 0.6) {
          input[dial] = color();
        }
      }
      if (!Object.keys(input).length) {
        input.accent = color();
      }
      if (next() < 0.5) {
        input.vibrancy = Math.floor(next() * 101);
      }
      if (next() < 0.5) {
        input.recipe = PALETTE_RECIPE_V2;
      }
      expectTokensApplied(input, `palette-random-${i}`);
    }
  });

  it('builds a theme for extreme seeds in every role, both recipes, and the vibrancy ends', () => {
    for (const seed of [
      '#000000',
      '#ffffff',
      '#ff0000',
      '#00ff00',
      '#0000ff',
      '#ffff00',
      '#808080',
      '#010101',
      '#fefefe',
    ]) {
      for (const recipe of [PALETTE_RECIPE, PALETTE_RECIPE_V2] as const) {
        for (const vibrancy of [0, 100]) {
          expectTokensApplied(
            Object.fromEntries([
              ...DIALS.map(dial => [dial, seed]),
              ['recipe', recipe],
              ['vibrancy', vibrancy],
            ]) as ThemePaletteInput,
            'palette-extreme',
          );
        }
      }
    }
  });

  it('reads a seed in any form Core reads a color in', () => {
    expect(themePalette({accent: 'rgb(91, 60, 196)'})).toEqual(
      themePalette({accent: '#5B3CC4'}),
    );
  });

  it.each([
    [{}, 'needs at least one seed color'],
    [{accent: 'var(--brand)'}, 'accent is "var(--brand)"'],
    [{accent: '#5b3cc480'}, 'a seed is one opaque color'],
    [{accent: '#5b3cc4', vibrancy: 101}, 'vibrancy is a whole number'],
    [{accent: '#5b3cc4', recipe: 'astryx-oklch-v9'}, 'is not a palette recipe'],
    [{accent: '#5b3cc4', primary: '#000'}, '"primary" is not a palette key'],
  ])('refuses %j, saying what to fix', (input, words) => {
    expect(() => themePalette(input as ThemePaletteInput)).toThrow(words);
  });
});

describe("themePalette's reading of Core's defaults", () => {
  // The palette reads Core's defaults without the theme runtime. Measured
  // against the defaults as `defineTheme` and `resolveThemeTokens` give
  // them, every palette comes out the same.
  const theme = defineTheme({name: 'astryx-defaults'});
  const context: PaletteMappingContext = {
    base: {
      light: resolveThemeTokens(theme, {mode: 'light'}),
      dark: resolveThemeTokens(theme, {mode: 'dark'}),
      components: theme.components ?? {},
    },
    has: token => Object.hasOwn(tokenDefaults, token),
    reader: {
      rgb: value => {
        const read = typeof value === 'string' ? parseColor(value) : null;
        return read ? [read.r, read.g, read.b] : null;
      },
      alpha: value =>
        typeof value !== 'string'
          ? 1
          : /^transparent$/i.test(value.trim())
            ? 0
            : (parseColor(value)?.a ?? 1),
    },
  };

  it('gives the same palette for 300 random inputs', () => {
    const {next, color} = seeded(300);
    for (let i = 0; i < 300; i++) {
      const input: Record<string, string | number> = {};
      for (const d of DIALS) {
        if (next() < 0.5) {
          input[d] = color();
        }
      }
      if (!Object.keys(input).length) {
        input.accent = color();
      }
      if (next() < 0.4) {
        input.vibrancy = Math.floor(next() * 101);
      }
      const recipe = next() < 0.5 ? PALETTE_RECIPE_V2 : PALETTE_RECIPE;
      const palette = themePalette({...input, recipe});
      const dials = PALETTE_DIALS.filter(d => input[d] !== undefined).map(
        id => {
          const read = parseColor(String(input[id]));
          return {id, seed: hex(read ? [read.r, read.g, read.b] : [])};
        },
      );
      const plan = planPaletteRequest(
        dials,
        {
          recipe,
          vibrancy:
            input.vibrancy === undefined ? undefined : Number(input.vibrancy),
        },
        context,
      );
      if (!plan) {
        throw new Error('no plan');
      }
      const mapping = mapPalette(
        generateTonalPalette(plan.config as never),
        dials,
        plan.fills,
        context,
      );
      const tokens = Object.fromEntries(
        Object.entries(mapping.tokens).map(([token, {light, dark}]) => [
          token,
          [light.color, dark.color],
        ]),
      );
      expect(palette.tokens, JSON.stringify(input)).toEqual(tokens);
      for (const [part, block, ground] of LIFT_PARTS) {
        const lifted = mapping.lift?.[ground];
        expect(palette.components[part]?.[block], `${part} ${block}`).toEqual(
          lifted?.light && lifted.dark
            ? {
                '@light': {'--color-text-secondary': lifted.light.color},
                '@dark': {'--color-text-secondary': lifted.dark.color},
              }
            : undefined,
        );
      }
    }
  });
});

describe('defineTheme({palette})', () => {
  const palette = themePalette({accent: '#5b3cc4', neutral: '#6b6b70'});

  it('compiles the lifted secondary text into each mode a browser reads', () => {
    const css = generateThemeCSS(
      defineTheme({name: 'palette-compiled', palette}),
    ).component;
    const lift = palette.components.item?.selected;
    const light = lift?.['@light']['--color-text-secondary'];
    const dark = lift?.['@dark']['--color-text-secondary'];
    expect(light).toMatch(/^#[0-9a-f]{6}$/);
    expect(dark).toMatch(/^#[0-9a-f]{6}$/);
    expect(css).toContain(`--color-text-secondary: ${light}`);
    expect(css).toContain(`--color-text-secondary: ${dark}`);
    expect(css).not.toMatch(/--color-text-secondary:\s*(\[|#[0-9a-f]{6},)/);
  });

  it('lifts secondary text on each coloured card, as the official theme does', () => {
    for (const color of ['blue', 'green', 'red', 'yellow']) {
      const lift = palette.components.card?.[`variant:${color}`];
      expect(lift?.['@light']['--color-text-secondary'], color).toMatch(/^#/);
      expect(lift?.['@dark']['--color-text-secondary'], color).toMatch(/^#/);
    }
  });

  it('lets a part style the theme sets win in both modes', () => {
    const theme = defineTheme({
      name: 'palette-own-style',
      palette,
      components: {
        item: {selected: {'--color-text-secondary': '#123456'}},
      },
    });
    // No mode block of the palette's is left to beat it in one mode.
    expect(theme.components?.item?.selected).toEqual({
      '--color-text-secondary': '#123456',
    });
    expect(generateThemeCSS(theme).component).toContain(
      '--color-text-secondary: #123456',
    );
  });

  it('lets an explicit token win, token by token', () => {
    const theme = defineTheme({
      name: 'palette-explicit',
      palette,
      tokens: {'--color-accent': ['#112233', '#445566']},
    });
    const light = resolveThemeTokens(theme, {mode: 'light'});
    const dark = resolveThemeTokens(theme, {mode: 'dark'});
    expect(light['--color-accent']?.toLowerCase()).toBe('#112233');
    expect(dark['--color-accent']?.toLowerCase()).toBe('#445566');
    expect(light['--color-on-accent']?.toLowerCase()).toBe(
      palette.tokens['--color-on-accent'][0],
    );
  });

  it("lets the theme's own part style win, property by property", () => {
    const theme = defineTheme({
      name: 'palette-components',
      palette,
      components: {
        item: {selected: {'--color-text-secondary': '#010203'}},
      },
    });
    expect(theme.components?.item?.selected).toEqual({
      '--color-text-secondary': '#010203',
    });
    expect(theme.components?.citation?.['variant:number']).toEqual(
      palette.components.citation?.['variant:number'],
    );
  });

  it('carries the palette to a theme that extends it', () => {
    const parent = defineTheme({name: 'palette-parent', palette});
    const child = defineTheme({name: 'palette-child', extends: parent});
    expect(resolveThemeTokens(child, {mode: 'dark'})).toEqual(
      resolveThemeTokens(parent, {mode: 'dark'}),
    );
  });

  it('builds a theme without a palette exactly as before', () => {
    const input = {
      name: 'palette-none',
      tokens: {'--color-accent': '#123456'},
    } as const;
    expect(defineTheme({...input, palette: undefined})).toEqual(
      defineTheme(input),
    );
  });

  it.each([
    [{accent: '#5b3cc4'}, 'got a plain object'],
    [null, 'got null'],
    ['#5b3cc4', 'got string'],
  ])('refuses %j as a palette, naming themePalette()', (value, words) => {
    expect(() =>
      defineTheme({name: 'palette-bad', palette: value as never}),
    ).toThrow(
      new RegExp(
        `palette\` must be made by themePalette\\(\\) from @astryxdesign/core/palette, ${words}`,
      ),
    );
  });
});
