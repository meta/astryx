// Copyright (c) Meta Platforms, Inc. and affiliates.
// Generated from packages/core/src/palette/editor-look.ts by
// scripts/generate-cli-palette-engine.mjs. Do not edit: change the Core
// source and run `pnpm generate:cli-palette-engine`.
/**
 * @file editor-look.ts
 * @input The token mapping `mapPalette` has made, and its palette
 * @output The colors a look grows beyond the seeds' own: category, chart
 *   and code colors, and the status roles a theme leaves unset
 * @position The palette mapping's `context.editor`, which `themePalette()`
 *   and the theme editor both pass
 */
import {compositeOver} from './color.mjs';
import {
  CATEGORY_HUES,
  cvdClashes,
  deriveCodeColors,
  deriveLookColors,
  deriveStatusColors,
  lookSeeds,
  statusSeeds,
} from './derive-look.mjs';
import {
  STATUS_TOKEN,
  TEXT,
  TEXT_PROPS,
  hex,
  isLookToken,
  ratio,
  round2,
  splitTopComma,
} from './mapping.mjs';

/** @typedef {import('./mapping.mjs').BasePair} BasePair */

/** @typedef {import('./mapping.mjs').ColorTriple} ColorTriple */

/** @typedef {import('./mapping.mjs').PaletteBase} PaletteBase */

/** @typedef {import('./mapping.mjs').PaletteColorReader} PaletteColorReader */

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
 * @property {string[]} code
 * @property {PaletteMapping['cvd']} cvd
 * @property {PaletteMapping['kept']} keptAtBase
 */

/**
 * The text/fill pairs a base theme draws: Core's own (each category's text
 * on its fill; each status's text on its fill and on its tint) and those of
 * the base theme's rules (a coloured card's text on its fill, a part's text
 * color on its background), as `[pair, text, fill]` values a mode resolves.
 * @param {PaletteBase | undefined} base
 * @returns {[BasePair, string, string][]}
 */
function basePairs(base) {
  /**
   * @type {[BasePair, string, string][]}
   */
  const out = [];
  for (const hue of CATEGORY_HUES) {
    out.push([
      {kind: 'category', hue},
      `var(--color-text-${hue})`,
      `var(--color-background-${hue})`,
    ]);
  }
  for (const role of ['info', 'success', 'warning', 'error']) {
    out.push([
      {kind: 'status', role, tint: false},
      `var(--color-on-${role})`,
      `var(--color-${role})`,
    ]);
    out.push([
      {kind: 'status', role, tint: true},
      `var(--color-on-${role}-muted)`,
      `var(--color-${role}-muted)`,
    ]);
  }
  for (const [part, rules] of Object.entries(
    /** @type {Record<string, Record<string, unknown>>} */ (
      base?.components ?? {}
    ),
  )) {
    for (const [key, raw] of Object.entries(rules ?? {})) {
      if (!raw || typeof raw !== 'object') {
        continue;
      }
      const block = /** @type {Record<string, unknown>} */ (raw);
      const hue = /^(?:variant|color):([a-z]+)$/.exec(key)?.[1];
      const fill =
        block.backgroundColor ??
        (hue &&
        HUE_FILL_PARTS.includes(part) &&
        /** @type {ReadonlyArray<string>} */ (CATEGORY_HUES).includes(hue)
          ? `var(--color-background-${hue})`
          : null);
      if (typeof fill !== 'string') {
        continue;
      }
      for (const prop of TEXT_PROPS) {
        const text = block[prop];
        if (typeof text === 'string') {
          out.push([{kind: 'part', part, block: key, prop}, text, fill]);
        }
      }
    }
  }
  return out;
}
/**
 * Keeps the base theme's value, in a mode, for each look color (category
 * or status) that would leave a text/fill pair the base theme draws below
 * 4.5:1 where the base's own values read better. Pairs are checked again
 * until none changes, so a fill kept at the base's sends its text back too.
 * `tokens` is written in place.
 * @param {PaletteMapping['tokens']} tokens
 * @param {PaletteBase | undefined} base
 * @param {ReadonlyArray<PaletteMode>} modes
 * @param {(k: string) => boolean} isLook
 * @param {PaletteColorReader} reader
 * @returns {PaletteMapping['kept']}
 */
function keepWhereBaseReads(tokens, base, modes, isLook, reader) {
  /**
   * @type {PaletteMapping['kept']}
   */
  const kept = [];
  const pairs = basePairs(base);
  /** A value's color in a mode, with the tokens it reads. */
  const colorOf =
    /**
     * @param {string} v
     * @param {PaletteMode} m
     * @param {boolean} now
     * @returns {ColorTriple | null}
     */
    (v, m, now, depth = 0) => {
      if (depth > 6) {
        return null;
      }
      let x = v.trim();
      const pair = /^light-dark\((.*)\)$/is.exec(x);
      if (pair) {
        const halves = splitTopComma(pair[1]);
        if (halves.length === 2) {
          x = halves[m === 'light' ? 0 : 1].trim();
        }
      }
      const ref = /^var\((--[\w-]+)\)$/.exec(x)?.[1];
      if (ref) {
        const own = now ? tokens[ref]?.[m]?.color : null;
        return colorOf(own ?? base?.[m]?.[ref] ?? '', m, now, depth + 1);
      }
      const rgb = reader.rgb(x);
      if (!rgb) {
        return null;
      }
      const page = reader.rgb(
        (now ? tokens['--color-background-body']?.[m]?.color : null) ??
          base?.[m]?.['--color-background-body'] ??
          (m === 'light' ? '#ffffff' : '#000000'),
      );
      const a = reader.alpha(x);
      return a < 1 && page ? compositeOver(rgb, a, page) : rgb;
    };
  /** The look tokens a value reads. */
  const reads =
    /**
     * @param {string} v
     * @returns {string[]}
     */
    v =>
      [...v.matchAll(/var\((--[\w-]+)\)/g)]
        .map(x => x[1])
        .filter(k => isLook(k) && k in tokens);
  for (let round = 0; round < 6; round++) {
    let changed = false;
    for (const m of modes) {
      for (const [pair, text, fill] of pairs) {
        const involved = [...reads(text), ...reads(fill)].filter(
          k => tokens[k]?.[m]?.family !== 'literal',
        );
        if (!involved.length) {
          continue;
        }
        const [ft, bt] = [colorOf(text, m, true), colorOf(fill, m, true)];
        const [fb, bb] = [colorOf(text, m, false), colorOf(fill, m, false)];
        if (!ft || !bt) {
          continue;
        }
        const now = ratio(ft, bt);
        const was = fb && bb ? ratio(fb, bb) : 0;
        if (now >= TEXT || now >= was - 0.01) {
          continue;
        }
        for (const k of involved) {
          const value = base?.[m]?.[k];
          if (value == null) {
            continue;
          }
          tokens[k] = {
            ...tokens[k],
            [m]: {stop: 0, color: value, family: 'literal'},
          };
          kept.push({token: k, mode: m, pair, ratio: round2(now)});
          changed = true;
        }
      }
    }
    if (!changed) {
      break;
    }
  }
  return kept;
}
/** A category or status token: the colors the look derives. */
const isLookOrStatus =
  /**
   * @param {string} k
   * @returns {boolean}
   */
  k =>
    isLookToken(k) ||
    /^--color-(?:(?:on|text|icon|border)-)?(?:info|success|warning|error)(?:-muted)?$/.test(
      k,
    );
/** The text a card tint carries, as the look gives it. */
const LOOK_TEXT = [
  '--color-text-primary',
  '--color-text-secondary',
  '--color-text-accent',
];
/** The grounds the look's colors are read on, as the look gives them. */
const LOOK_GROUNDS = [
  '--color-background-body',
  '--color-background-surface',
  '--color-background-card',
];
/** The parts whose `variant:<hue>` and `color:<hue>` rules paint a category fill. */
const HUE_FILL_PARTS = ['card', 'clickable-card', 'selectable-card', 'token'];
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
  const out = Object.entries(
    lookSeeds(accent, dials.find(d => d.id === 'neutral')?.seed),
  ).map(([id, seed]) => named(id, seed));
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
 * The colors a look grows beyond the seeds' own, written into `tokens`
 * as shades of the palette.
 * @param {EditorLookInput} input
 * @returns {EditorLookResult}
 */
export function growLook(input) {
  const {candidate, dials, context, tokens, modes, setExactly, t} = input;
  const {alphaOf, exactOf, parseColor, stops} = t;
  const {base, has} = context;
  /**
   * The look's own colors for tokens in a mode: what the palette gives them,
   * else the base theme's. A color set exactly (a page fill, a link color)
   * is not the look's: the colors the look grows never follow it.
   */
  const lookColors =
    /**
     * @param {string[]} ks
     * @param {PaletteMode} m
     * @returns {string[]}
     */
    (ks, m) =>
      ks
        .map(k => tokens[k]?.[m]?.color ?? t.colorIn(base?.[m]?.[k] ?? '', m))
        .filter(
          /**
           * @returns {v is string}
           */
          v => Boolean(v && parseColor(v) && alphaOf(v) >= 1),
        );
  /**
   * @type {PaletteMapping['categories']}
   */
  const categories = mapCategories();
  /**
   * @type {PaletteMapping['statuses']}
   */
  const statuses = mapStatuses();
  const code = mapCode();
  /**
   * @type {PaletteMapping['cvd']}
   */
  const cvd = statusClashes();
  /**
   * The status fills, as the theme shows them, that someone red-weak or
   * green-weak may not tell apart, in each mode, where the theme changed at
   * least one of the two (a base theme's own pair is the base's).
   * @returns {PaletteMapping['cvd']}
   */
  function statusClashes() {
    /**
     * @type {PaletteMapping['cvd']}
     */
    const out = [];
    const words = ['info', 'success', 'warning', 'error'];
    // (Every mode's page: a status color set with no mode shows on each.)
    const pages = modes.map(m => {
      const c = parseColor(
        tokens['--color-background-body']?.[m]?.color ??
          t.colorIn(base?.[m]?.['--color-background-body'] ?? '', m) ??
          (m === 'light' ? '#ffffff' : '#000000'),
      );
      return c ? hex(c) : m === 'light' ? '#ffffff' : '#000000';
    });
    for (const m of modes) {
      /**
       * @type {Record<string, string>}
       */
      const fills = {};
      for (const w of words) {
        const k = `--color-${w}`;
        const v =
          exactOf(k, m) ??
          tokens[k]?.[m]?.color ??
          t.colorIn(base?.[m]?.[k] ?? '', m);
        const rgb = v ? parseColor(v) : null;
        if (v && rgb && alphaOf(v) >= 1) {
          fills[w] = hex(rgb);
        }
      }
      const changed =
        /**
         * @param {string} w
         * @returns {boolean}
         */
        w => `--color-${w}` in tokens || exactOf(`--color-${w}`, m) != null;
      const pageOf = parseColor(
        tokens['--color-background-body']?.[m]?.color ??
          t.colorIn(base?.[m]?.['--color-background-body'] ?? '', m) ??
          (m === 'light' ? '#ffffff' : '#000000'),
      );
      const page = pageOf ? hex(pageOf) : m === 'light' ? '#ffffff' : '#000000';
      for (const c of cvdClashes(fills)) {
        if (changed(c.a) || changed(c.b)) {
          out.push({
            ...c,
            mode: m,
            colors: [fills[c.a], fills[c.b]],
            page,
            pages,
          });
        }
      }
    }
    return out;
  }
  /**
   * The status roles the theme leaves unset, from the palette's families of
   * them (deriveStatusColors), written as its shades; a token set by hand
   * keeps its value, and every other one is written.
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
      return {roles: {}, why: [], short: []};
    }
    const derived = deriveStatusColors({
      palette: pal,
      stops,
      modes,
      roles,
      grounds: m => lookColors(LOOK_GROUNDS, m),
      inks: (m, id) =>
        t.onChoices(id, m).map(r => ({
          stop: r.stop,
          color: r.color,
          family: r.family ?? 'neutral',
        })),
      accent: m => tokens['--color-accent']?.[m]?.color ?? null,
      wanted: k => has(k) && !setExactly(k),
      ...(context.shown ? {shown: context.shown} : {}),
    });
    for (const [k, v] of Object.entries(derived.tokens)) {
      tokens[k] = {family: v.family, light: v.light, dark: v.dark};
    }
    return {roles: derived.roles, why: derived.why, short: derived.short};
  }
  /**
   * The code colors and the overlay scrim, from the palette
   * (deriveCodeColors); a token set by hand keeps its value. Returns the
   * roles that keep the base theme's.
   * @returns {string[]}
   */
  function mapCode() {
    const derived = deriveCodeColors({
      palette:
        /** @type {Record< string, Record<PaletteMode, Record<string | number, string>> >} */ (
          /** @type {unknown} */ (candidate.palette)
        ),
      stops,
      modes,
      grounds: m => lookColors(LOOK_GROUNDS, m),
      codeGround: m => {
        const v = exactOf('--color-syntax-background', m);
        const rgb = v ? parseColor(v) : null;
        return v && rgb && alphaOf(v) >= 1 ? hex(rgb) : null;
      },
      wanted: k => has(k) && !setExactly(k),
    });
    for (const [k, v] of Object.entries(derived.tokens)) {
      tokens[k] = {family: v.family, light: v.light, dark: v.dark};
    }
    return derived.unreadable;
  }
  /** A status token of a role the theme leaves unset: the editor's to grow. */
  const grownStatus =
    /**
     * @param {string} k
     * @returns {boolean}
     */
    k =>
      Object.keys(STATUS_TOKEN).some(
        d =>
          !dials.some(f => f.id === d) &&
          new RegExp(
            `^--color-(?:(?:on|text|icon|border)-)?${STATUS_TOKEN[d]}(?:-muted)?$`,
          ).test(k),
      );
  const keptAtBase = keepWhereBaseReads(
    tokens,
    base,
    modes,
    k => isLookToken(k) || (isLookOrStatus(k) && grownStatus(k)),
    context.reader,
  );
  /**
   * The category colors (Badge, Token and Card tints) and the chart colors
   * the palette derives (deriveLookColors), written as its shades. A token
   * the theme sets by hand keeps its value; every other one is written.
   * @returns {PaletteMapping['categories']}
   */
  function mapCategories() {
    const derived = deriveLookColors({
      palette:
        /** @type {Record< string, Record<PaletteMode, Record<string | number, string>> >} */ (
          /** @type {unknown} */ (candidate.palette)
        ),
      stops,
      modes,
      // Card text, secondary text and links all sit on a card tint.
      text: m => lookColors(LOOK_TEXT, m),
      grounds: m => lookColors(LOOK_GROUNDS, m),
      wanted: k => has(k) && !setExactly(k),
      ...(context.shown ? {shown: context.shown} : {}),
      accent: dials.find(f => f.id === 'accent')?.seed ?? null,
    });
    for (const [k, v] of Object.entries(derived.tokens)) {
      tokens[k] = {family: v.family, light: v.light, dark: v.dark};
    }
    return {
      badges: derived.badges,
      chart: derived.chart,
      limits: derived.limits,
      moved: derived.moved,
      alike: derived.alike,
      unread: derived.unread,
    };
  }
  return {categories, statuses, code, cvd, keptAtBase};
}
