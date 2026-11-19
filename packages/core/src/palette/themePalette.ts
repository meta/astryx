// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file themePalette.ts
 * @input Seed colors (accent, neutral, success, warning, danger, info), a
 *   vibrancy and a recipe
 * @output A ThemePalette: the color tokens, and the part styles that lift
 *   secondary text, for `defineTheme({palette})`
 * @position The palette input of `@astryxdesign/core/palette`. It plans the
 *   request, runs the engine, and maps the stops against Core's defaults
 */

import {tokenDefaults} from '../theme/tokenDefaults';
import {resolveDefaultTokens} from '../theme/tokenValues';
import {parseColor} from '../utils/color';
import {
  PALETTE_RECIPE,
  PALETTE_RECIPES,
  generateTonalPalette,
} from './generator';
import {
  LIFT_PARTS,
  PALETTE_DIALS,
  hex,
  mapPalette,
  planPaletteRequest,
  type PaletteBase,
  type PaletteColorReader,
  type PaletteDial,
  type PaletteMappingContext,
} from './mapping';
import type {PaletteLift, ThemePalette, ThemePaletteInput} from './types';

const INPUT_KEYS: ReadonlyArray<string> = Object.freeze([
  ...PALETTE_DIALS,
  'vibrancy',
  'recipe',
]);

/** Core's color reader: hex, rgb() and rgba(), black, white and transparent. */
const coreReader: PaletteColorReader = {
  rgb: value => {
    const read = typeof value === 'string' ? parseColor(value) : null;
    return read ? [read.r, read.g, read.b] : null;
  },
  alpha: value => {
    if (typeof value !== 'string') {
      return 1;
    }
    if (/^transparent$/i.test(value.trim())) {
      return 0;
    }
    return parseColor(value)?.a ?? 1;
  },
};

/**
 * Core's default colors in each mode: what a palette is measured against.
 * Read per call, from the defaults alone, so the entry holds no state and
 * runs on a server as it runs at build time.
 */
function defaultBase(): PaletteBase {
  return {
    light: resolveDefaultTokens('light'),
    dark: resolveDefaultTokens('dark'),
    components: {},
  };
}

/**
 * Makes a theme's colors from a few seeds. The palette is generated with a
 * pinned recipe and mapped to the color tokens as the CLI theme editor maps
 * it, against Core's defaults. Pass the result to `defineTheme({palette})`;
 * the theme's own `tokens` still win, token by token.
 *
 * @example
 * ```
 * import {defineTheme} from '@astryxdesign/core/theme';
 * import {themePalette} from '@astryxdesign/core/palette';
 *
 * export const acme = defineTheme({
 *   name: 'acme',
 *   palette: themePalette({accent: '#5b3cc4', neutral: '#6b6b70'}),
 * });
 * ```
 */
export function themePalette(input: ThemePaletteInput): ThemePalette {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new TypeError(
      'themePalette() takes an object of seed colors, such as {accent: "#5b3cc4"}.',
    );
  }
  const unknown = Object.keys(input).filter(key => !INPUT_KEYS.includes(key));
  if (unknown.length) {
    throw new TypeError(
      `themePalette(): ${unknown.map(key => `"${key}"`).join(', ')} is not a palette key. It takes ${INPUT_KEYS.join(', ')}.`,
    );
  }
  const recipe = input.recipe ?? PALETTE_RECIPE;
  if (!PALETTE_RECIPES.includes(recipe)) {
    throw new TypeError(
      `themePalette(): recipe "${String(input.recipe)}" is not a palette recipe. It takes ${PALETTE_RECIPES.join(', ')}.`,
    );
  }
  const {vibrancy} = input;
  if (
    vibrancy !== undefined &&
    (typeof vibrancy !== 'number' ||
      !Number.isInteger(vibrancy) ||
      vibrancy < 0 ||
      vibrancy > 100)
  ) {
    throw new TypeError(
      `themePalette(): vibrancy is a whole number from 0 to 100, got ${JSON.stringify(vibrancy)}.`,
    );
  }
  const dials: PaletteDial[] = [];
  for (const id of PALETTE_DIALS) {
    const value = input[id as keyof ThemePaletteInput];
    if (value === undefined) {
      continue;
    }
    const read = typeof value === 'string' ? parseColor(value) : null;
    if (!read || read.a < 1) {
      throw new TypeError(
        `themePalette(): ${id} is ${JSON.stringify(value)}, and a seed is one opaque color: a hex such as "#5b3cc4", rgb(), black or white.`,
      );
    }
    dials.push({id, seed: hex([read.r, read.g, read.b])});
  }
  if (!dials.length) {
    throw new TypeError(
      `themePalette() needs at least one seed color: ${PALETTE_DIALS.join(', ')}.`,
    );
  }
  const context: PaletteMappingContext = {
    base: defaultBase(),
    has: token => Object.hasOwn(tokenDefaults, token),
    reader: coreReader,
  };
  const plan = planPaletteRequest(dials, {recipe, vibrancy}, context);
  if (!plan) {
    throw new TypeError('themePalette() needs at least one seed color.');
  }
  const candidate = generateTonalPalette(plan.config as never);
  const mapping = mapPalette(candidate, dials, plan.fills, context);
  const tokens: Record<string, readonly [string, string]> = {};
  for (const [token, {light, dark}] of Object.entries(mapping.tokens)) {
    tokens[token] = Object.freeze([light.color, dark.color] as const);
  }
  const components: Record<string, Record<string, PaletteLift>> = {};
  for (const [part, block, ground] of LIFT_PARTS) {
    const lifted = mapping.lift?.[ground];
    if (!lifted?.light || !lifted.dark) {
      continue;
    }
    (components[part] ??= {})[block] = Object.freeze({
      '@light': Object.freeze({'--color-text-secondary': lifted.light.color}),
      '@dark': Object.freeze({'--color-text-secondary': lifted.dark.color}),
    });
  }
  return Object.freeze({
    kind: 'theme-palette',
    recipe,
    tokens: Object.freeze(tokens),
    components: Object.freeze(
      Object.fromEntries(
        Object.entries(components).map(([part, blocks]) => [
          part,
          Object.freeze(blocks),
        ]),
      ),
    ),
  });
}
