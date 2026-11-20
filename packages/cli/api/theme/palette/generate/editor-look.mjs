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
import {
  deriveLookColors,
  deriveStatusColors,
  lookSeeds,
  statusSeeds,
} from './derive-look.mjs';
import {STATUS_TOKEN, hex} from './mapping.mjs';

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
 * @property {PaletteMapping['statuses']} statuses
 */

/**
 * The families the theme editor grows beside the theme's own colors, in
 * order: the category and chart hues of the look (lookSeeds), then the
 * status roles the theme leaves unset, from the base theme's color for
 * each (statusSeeds). Empty without a color setting.
 * @param {ReadonlyArray<PaletteDial>} dials
 * @param {Pick<PaletteMappingContext, 'base' | 'reader'>} context
 * @returns {{id: string; name: string; seed: string}[]}
 */
export function grownFamilies(dials, context) {
  if (!dials.length) {
    return [];
  }
  const named =
    /**
     * @param {string} id
     * @param {string} seed
     */
    (id, seed) => ({
      id,
      name: id[0].toUpperCase() + id.slice(1),
      seed,
    });
  const accent = dials.find(d => d.id === 'accent')?.seed;
  const out = Object.entries(lookSeeds(accent)).map(([id, seed]) =>
    named(id, seed),
  );
  /**
   * @type {Record<string, string>}
   */
  const baseColors = {};
  for (const d of Object.keys(STATUS_TOKEN)) {
    if (dials.some(f => f.id === d)) {
      continue;
    }
    const v = context.base?.light?.[`--color-${STATUS_TOKEN[d]}`];
    const rgb = v ? context.reader.rgb(v) : null;
    if (rgb && context.reader.alpha(v) >= 1) {
      baseColors[d] = hex(rgb);
    }
  }
  for (const [id, seed] of Object.entries(statusSeeds(baseColors, accent))) {
    if (!out.some(f => f.id === id)) {
      out.push(named(id, seed));
    }
  }
  return out;
}
/**
 * The colors the theme editor grows beyond `themePalette()`'s mapping,
 * written into `tokens` as shades of the palette.
 * @param {EditorLookInput} input
 * @returns {EditorLookResult}
 */
export function growLook(input) {
  const {candidate, dials, context, tokens, modes, setExactly, t} = input;
  const {alphaOf, exactOf, parseColor, stops, surfaces} = t;
  const {base, has} = context;
  /**
   * @type {PaletteMapping['categories']}
   */
  const categories = mapCategories();
  /**
   * @type {PaletteMapping['statuses']}
   */
  const statuses = mapStatuses();
  /**
   * The status roles the theme leaves unset, from the palette's families of
   * them (deriveStatusColors), written as its shades; a token set by hand
   * keeps its value, and a role that cannot be drawn readable and apart
   * from the accent keeps the base theme's.
   * @returns {PaletteMapping['statuses']}
   */
  function mapStatuses() {
    const pal =
      /** @type {Record< string, Record<PaletteMode, Record<string | number, string>> >} */ (
        /** @type {unknown} */ (candidate.palette)
      );
    const roles = Object.keys(STATUS_TOKEN).filter(
      d => !dials.some(f => f.id === d) && pal[d],
    );
    if (!roles.length) {
      return {roles: {}, why: []};
    }
    const derived = deriveStatusColors({
      palette: pal,
      stops,
      modes,
      roles,
      grounds: m => surfaces(m, 'neutral').map(([, c]) => c),
      inks: (m, id) =>
        t.onChoices(id, m).map(r => ({
          stop: r.stop,
          color: r.color,
          family: r.family ?? 'neutral',
        })),
      accent: m => tokens['--color-accent']?.[m]?.color ?? null,
      wanted: k => has(k) && !setExactly(k),
    });
    for (const [k, v] of Object.entries(derived.tokens)) {
      tokens[k] = {family: v.family, light: v.light, dark: v.dark};
    }
    return {roles: derived.roles, why: derived.why};
  }
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
  return {categories, statuses};
}
