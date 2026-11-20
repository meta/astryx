// Copyright (c) Meta Platforms, Inc. and affiliates.
// Generated from packages/core/src/palette/editor-look.ts by
// scripts/generate-cli-palette-engine.mjs. Do not edit: change the Core
// source and run `pnpm generate:cli-palette-engine`.
/**
 * @file editor-look.ts
 * @input The token mapping `mapPalette` has made, and its palette
 * @output The colors the theme editor grows beyond `themePalette()`'s
 *   mapping
 * @position The theme editor's own rules, its `context.editor`. Its own
 *   module, so an app that imports only `themePalette()` ships none of it
 */
import {deriveLookColors} from './derive-look.mjs';

/** @typedef {import('./mapping.mjs').PaletteDial} PaletteDial */

/** @typedef {import('./mapping.mjs').PaletteMapping} PaletteMapping */

/** @typedef {import('./mapping.mjs').PaletteMappingContext} PaletteMappingContext */

/** @typedef {import('./mapping.mjs').PaletteMode} PaletteMode */

/** @typedef {import('./mapping.mjs').PaletteTools} PaletteTools */

/** @typedef {import('./types.mjs').TonalPaletteCandidate} TonalPaletteCandidate */

/**
 * What `mapPalette` hands the editor's rules.
 * @typedef {object} EditorLookInput
 * @property {TonalPaletteCandidate} candidate
 * @property {ReadonlyArray<PaletteDial>} dials
 * @property {PaletteMappingContext} context
 * @property {PaletteMapping['tokens']} tokens
 * @property {PaletteMode[]} modes
 * @property {(token: string) => boolean} setExactly
 * @property {PaletteTools} t
 */

/**
 * The editor's rules as `mapPalette` reads them (`context.editor`): this module.
 * @typedef {object} PaletteEditorRules
 * @property {(input: EditorLookInput) => EditorLookResult} growLook
 */

/**
 * What the editor's rules add to a mapping.
 * @typedef {object} EditorLookResult
 * @property {PaletteMapping['categories']} categories
 */

/**
 * The colors the theme editor grows beyond `themePalette()`'s mapping,
 * written into `tokens` as shades of the palette.
 * @param {EditorLookInput} input
 * @returns {EditorLookResult}
 */
export function growLook(input) {
  const {candidate, context, tokens, modes, setExactly, t} = input;
  const {alphaOf, exactOf, parseColor, stops, surfaces} = t;
  const {base, has} = context;
  /**
   * @type {PaletteMapping['categories']}
   */
  const categories = mapCategories();
  /**
   * The category colors (Badge, Token and Card tints) and the chart colors
   * the palette derives (deriveLookColors), written as its shades. A token
   * the theme sets by hand keeps its value; a set the palette cannot
   * draw readable and apart keeps the base theme's.
   * @returns {PaletteMapping['categories']}
   */
  function mapCategories() {
    /** The theme's color for a token in a mode. */
    const themeColor =
      /**
       * @param {string} k
       * @param {PaletteMode} m
       * @returns {string | null}
       */
      (k, m) => {
        const v =
          exactOf(k, m) ??
          tokens[k]?.[m]?.color ??
          t.colorIn(base?.[m]?.[k] ?? '', m);
        return v && parseColor(v) && alphaOf(v) >= 1 ? v : null;
      };
    const derived = deriveLookColors({
      palette:
        /** @type {Record< string, Record<PaletteMode, Record<string | number, string>> >} */ (
          /** @type {unknown} */ (candidate.palette)
        ),
      stops,
      modes,
      text: m =>
        // Card text, secondary text and links all sit on a card tint.
        [
          '--color-text-primary',
          '--color-text-secondary',
          '--color-text-accent',
        ]
          .map(k => themeColor(k, m))
          .filter(
            /**
             * @returns {c is string}
             */
            c => Boolean(c),
          ),
      grounds: m => surfaces(m, 'neutral').map(([, c]) => c),
      wanted: k => has(k) && !setExactly(k),
    });
    for (const [k, v] of Object.entries(derived.tokens)) {
      tokens[k] = {family: v.family, light: v.light, dark: v.dark};
    }
    return {
      badges: derived.badges,
      chart: derived.chart,
      merged: derived.merged,
      unreadable: derived.unreadable.map(
        u =>
          `${u.token} reads at only ${u.ratio}:1 in ${u.mode} (needs ${u.needs}:1)`,
      ),
    };
  }
  return {categories};
}
