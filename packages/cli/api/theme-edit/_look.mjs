// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a person would see as broken in a built theme, in each mode,
 * and the values that repair it. Text is measured on every real
 * text-on-background pair of the part data. Menus, control edges, the
 * page and the parts the theme styles are measured from the theme's own
 * resolved values. The repair fills the colors the theme leaves unset from
 * the palette generator (seeded by the colors it sets), moves only the
 * lightness of the theme's own text until it reads, and changes no other
 * color the theme sets.
 *
 * @input the theme's resolved tokens and part styles, Core's defaults, the
 *   part data and what the app does with the theme
 * @output problems, and the values that repair them
 * @position api/theme-edit — pure; used by the adapter's theme check
 */

import {
  LOOKS_ALIKE,
  alphaOf,
  compositeOver,
  hex,
  nearestReadingLightness,
  oklabDistance,
  parseColor,
  plainOn,
  ratio,
  splitTop,
  nearestLightness,
} from './_color.mjs';
import {gradientColorBehindText, gradientStops} from './_css.mjs';
import * as editorLook from '../theme/palette/generate/editor-look.mjs';
import {acceptCovers} from './_accepted.mjs';
import {familyOf} from './_tables.mjs';
import {
  hasGenericFamily,
  namedFontFamilies,
} from '../theme/build/font-warning.mjs';
import {fontKey} from '../../foundation/fonts/font-stylesheet.mjs';
import {
  NON_TEXT,
  STATUS_TOKEN,
  TEXT,
  mapPalette,
  planPaletteRequest,
} from '../theme/palette/generate/mapping.mjs';
import {
  PALETTE_RECIPE_V2,
  generateTonalPalette,
} from '../theme/palette/generate/generator.mjs';

/** @typedef {'light' | 'dark'} Mode */
/** @typedef {[number, number, number]} Rgb */
/** @typedef {import('./_parts.mjs').TextPair} TextPair */
/** @typedef {import('./_parts.mjs').PaintSide} PaintSide */

/**
 * One problem a person would see.
 * @typedef {object} LookProblem
 * @property {'text' | 'part-text' | 'bar-text' | 'see-through' | 'blend' | 'edge' | 'half-painted' | 'one-look' | 'page' | 'hover' | 'font' | 'font-unloaded' | 'charts' | 'page-image' | 'bar-fill' | 'chart-ground' | 'bar-ground'} kind
 * @property {Mode | 'both'} mode
 * @property {string} message
 * @property {string} [token] the token that draws it
 * @property {string} [on] what it sits on: a token, or a part's fill
 * @property {string} [part] the part whose own style draws it
 * @property {string[]} [parts] the parts where it shows
 * @property {number} [ratio]
 * @property {number} [needs]
 */

/** @typedef {import('./_accepted.mjs').AcceptRecord} AcceptRecord */

/**
 * What the check reads.
 * @typedef {object} Look
 * @property {Mode[]} modes
 * @property {Record<Mode, Record<string, string>>} res the theme's resolved tokens per mode
 * @property {Set<string>} own the tokens the theme sets
 * @property {Record<string, Record<string, any>>} components the theme's part styles
 * @property {Record<Mode, Record<string, string>>} base Core's own resolved tokens per mode
 * @property {Record<string, string>} defaults Core's token defaults
 * @property {TextPair[]} pairs every real text-on-background pair
 * @property {Record<string, import('./_parts.mjs').PartRecord>} map the part data
 * @property {(value: any, base: any, modes: string[], helpers: any) => {problems: any[]}} contrast the compiler's contrast measure
 * @property {{themed: boolean, pinned: Mode | null, modeByExpression?: boolean, painted: boolean, fonts: Set<string> | null, entry: string | null, pageImage: Array<{file: string, value: string}>} | null} app what the app does with the theme, the font families it loads (as family keys) and the file that loads Core's stylesheet; null outside an app
 * @property {AcceptRecord[]} accepted the contrast the theme keeps as designed
 * @property {(extra: Record<string, [string, string]>) => Record<Mode, Record<string, string>>} [resolveWith] the theme's tokens resolved again with more set, as Core resolves them
 * @property {(family: string) => {pkg: string, known: boolean, install: string} | null} fontInstall the package to suggest for a font family (`known` false when Fontsource may not publish it) and the command that installs it; null for a font a system ships
 * @property {string[]} unloadedFonts the font families the theme names that are neither generic nor installed with the system
 * @property {(pair: TextPair, fill: string | null, tokens: Record<string, string>, mode: Mode) => string[]} textTokens
 *   the text tokens a pair's text reads on its fill in a mode, as the
 *   editor reads Core's media surface
 */

/** The page and the grounds text and controls sit on. */
const PAGE = '--color-background-body';
const POPOVER = '--color-background-popover';
const CARD = '--color-background-card';
const SURFACE = '--color-background-surface';
const GROUNDS = [PAGE, SURFACE, CARD, POPOVER];
const EDGE = '--color-border-emphasized';
/** The category colors (Badge, Token and Card tints) and the chart colors. */
const CATEGORY_OR_CHART =
  /^--color-(data-[a-z0-9-]+|(background|text|icon|border)-(red|orange|yellow|green|teal|cyan|blue|purple|pink|gray))$/;
/** The pointer tints a bar can set for the parts it holds. */
const BAR_TINTS = [
  '--color-overlay-hover',
  '--color-overlay-pressed',
  '--color-neutral',
];
/** The surfaces Core's media parts paint and hold their on-colors on. */
export const INVERTED_SURFACES = [
  '--color-background-inverted',
  '--color-background-error-inverted',
];
/** The share of Core's own edge contrast a control edge must reach. */
const EDGE_SHARE = 0.95;
const TEXT_TOKEN = /^--color-(text|icon)-/;
/** Tokens drawn only as text or icons, never as a fill: the ones a repair may move. */
const DRAWN_AS_TEXT = /^--color-(text|icon|on)-/;

/**
 * A value as one mode draws it: the side of a `light-dark()` pair, each
 * `var()` read from the resolved tokens. Null when it gives no one color.
 * @param {unknown} value
 * @param {Record<string, string>} res
 * @param {Mode} m
 * @param {Set<string>} [seen]
 * @returns {string | null}
 */
export function colorIn(value, res, m, seen = new Set()) {
  const v = String(value ?? '').trim();
  if (!v) return null;
  if (parseColor(v)) return v;
  const fn = /^([a-z-]+)\((.*)\)$/is.exec(v);
  if (!fn) return null;
  const name = fn[1].toLowerCase();
  if (name === 'light-dark') {
    const halves = splitTop(fn[2], ',');
    return halves.length === 2
      ? colorIn(halves[m === 'dark' ? 1 : 0], res, m, seen)
      : null;
  }
  if (name !== 'var') return null;
  const [ref, ...rest] = splitTop(fn[2], ',');
  const t = ref.trim();
  if (seen.has(t)) return null;
  seen.add(t);
  return (
    colorIn(res[t], res, m, seen) ??
    (rest.length ? colorIn(rest.join(','), res, m, seen) : null)
  );
}

/**
 * The value a part's own style gives a property in a mode, or null: the
 * variant block the pair is drawn in, else the plain one, a mode block
 * inside it first.
 * @param {Record<string, Record<string, any>>} components
 * @param {string | null} part
 * @param {string[]} keys the property names, as a theme writes them
 * @param {Mode} m
 * @param {string | null} [when] a variant block (`variant:primary`)
 * @returns {string | null}
 */
export function partValue(components, part, keys, m, when = null) {
  if (!part) return null;
  const blocks = components?.[part];
  if (!blocks || typeof blocks !== 'object') return null;
  for (const block of [when, 'base']) {
    const style = block ? blocks[block] : null;
    if (!style || typeof style !== 'object') continue;
    // A block under a structural selector (`:not(.astryx-dialog *)`) is
    // the part at rest in most places: it counts after the plain block.
    const placed = Object.entries(style)
      .filter(([k, v]) => REST_SELECTOR.test(k) && v && typeof v === 'object')
      .flatMap(([, v]) => [v[`@${m}`], v]);
    for (const inner of [style[`@${m}`], style, ...placed])
      if (inner && typeof inner === 'object')
        for (const k of keys) if (typeof inner[k] === 'string') return inner[k];
  }
  return null;
}

/**
 * A selector key that places a style without a state: `:not(…)`,
 * `:where(…)` or `:is(…)`, the ones the theme build nests; never a pointer,
 * focus or check state.
 */
const REST_SELECTOR =
  /^(?!.*:(hover|active|focus|focus-visible|focus-within|disabled|checked|visited)\b)(:not\(|:where\(|:is\()/;

/**
 * The fill a part's own style paints in a block: a background image that
 * is one opaque gradient (it paints over the color under it, and is
 * measured where text sits), else its background color; null for none.
 * @param {Look['components']} components
 * @param {string | null | undefined} part @param {Mode} m
 * @param {string | null} [block]
 * @param {Record<string, string> | null} [tokens] the tokens a gradient's
 *   variables are read from
 */
function ownFill(components, part, m, block = null, tokens = null) {
  if (!part) return null;
  const color = partValue(
    components,
    part,
    ['backgroundColor', 'background'],
    m,
    block,
  );
  const image = partValue(components, part, ['backgroundImage'], m, block);
  // One opaque gradient paints over the color under it: text sits on it.
  const read = typeof image === 'string' ? withTokens(image, tokens, m) : null;
  if (read && opaqueGradient(read)) return read;
  // A gradient written in the shorthand is read the same way: one opaque
  // gradient is the fill; any other is not a fill the check can measure.
  if (typeof color === 'string' && /gradient\(/.test(color)) {
    const shorthand = withTokens(color, tokens, m);
    return opaqueGradient(shorthand) ? shorthand : null;
  }
  return color;
}

/**
 * Whether a background image is one linear or radial gradient of opaque
 * stops: the contrast measure reads it where text sits.
 * @param {string} image
 */
const opaqueGradient = image => fillStops(image) != null;

/**
 * The stops of a value that is exactly one linear or radial gradient of
 * opaque colors the check can read, the shared stop reader's way; null for
 * anything else (a position or size after it, a second layer, a stop it
 * cannot read or that is see-through), which is then no fill.
 * @param {string} image
 * @returns {string[] | null}
 */
function fillStops(image) {
  const v = image.trim();
  if (
    !/^(linear|radial)-gradient\(.*\)$/s.test(v) ||
    splitTop(v, ' ').length !== 1 ||
    splitTop(v, ',').length !== 1
  )
    return null;
  const stops = gradientStops(v);
  return stops?.every(c => parseColor(c) != null && alphaOf(c) >= 1)
    ? stops
    : null;
}

/**
 * A value with each `var()` read from the tokens (the theme's own local
 * ones included), its fallback when the token is not there.
 * @param {string} v @param {Record<string, string> | null} tokens
 * @param {string} [mode] the mode a `light-dark()` value is read for
 */
function withTokens(v, tokens, mode = 'light') {
  if (!tokens) return v;
  let value = v;
  for (let i = 0; i < 8 && /var\(--|light-dark\(/.test(value); i++)
    value = sideIn(
      value.replace(
        /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*))?\)/g,
        (whole, name, fallback) => tokens[name] ?? fallback ?? whole,
      ),
      mode,
    );
  return value;
}

/**
 * A value with each `light-dark(a, b)` taken as the mode draws it.
 * @param {string} v @param {string} mode
 */
function sideIn(v, mode) {
  let out = v;
  for (
    let at = out.indexOf('light-dark(');
    at >= 0;
    at = out.indexOf('light-dark(')
  ) {
    let depth = 0;
    let end = -1;
    for (let k = at + 'light-dark'.length; k < out.length; k++) {
      if (out[k] === '(') depth++;
      else if (out[k] === ')' && --depth === 0) {
        end = k;
        break;
      }
    }
    if (end < 0) break;
    const [light, dark] = splitTop(
      out.slice(at + 'light-dark('.length, end),
      ',',
    );
    out = `${out.slice(0, at)}${(mode === 'dark' ? dark : light)?.trim() ?? ''}${out.slice(end + 1)}`;
  }
  return out;
}

/**
 * The opaque color a value shows over the page, or null.
 * @param {string | null} v @param {Rgb | null} page
 * @returns {Rgb | null}
 */
function shown(v, page) {
  const c = v ? /** @type {Rgb | null} */ (parseColor(v)) : null;
  if (!c) return null;
  const a = alphaOf(v);
  return a < 1 && page ? compositeOver(c, a, page) : c;
}

/** Light or dark, by the text that reads on it. @param {Rgb} rgb @returns {Mode} */
const sideOf = rgb => (plainOn(rgb) === '#000000' ? 'light' : 'dark');

/** @param {number} r */
const fixed = r => Number(r.toFixed(2));

/**
 * The parts inside a part, as the part data records them.
 * @param {Look['map']} map @param {string} part
 * @returns {Set<string>}
 */
function inside(map, part) {
  const within = new Set(map[part]?.contains ?? []);
  // A page bar holds whatever controls an app puts in it (a filter's
  // segmented control, tabs, badges), and what they hold.
  if (PAGE_BARS.includes(part))
    for (const q of FREE_PARTS)
      for (const r of [q, ...(map[q]?.contains ?? [])]) within.add(r);
  // A menu opens in place inside the control that opens it, so it takes
  // the text tokens of every part around that control.
  if ([...within].some(q => MENU_OPENERS.includes(q)))
    for (const {part: menu} of menuParts(map))
      for (const q of [menu, ...(map[menu]?.contains ?? [])]) within.add(q);
  return within;
}

/** Parts that open a menu where they stand. */
const MENU_OPENERS = ['button', 'top-nav-item', 'selector', 'multi-selector'];

/**
 * The record that would keep each text problem's pairs as designed, by
 * problem: what a repair names beside a color it moves.
 * @type {WeakMap<LookProblem, Array<Omit<AcceptRecord, 'reason'>>>}
 */
const ACCEPT = new WeakMap();

/**
 * Text problems: every real pair below 4.5:1 now, measured with the
 * theme's tokens and its own part styles, and lower than in Core's own
 * look. (A pair Core's own look draws as low is one the part data does not
 * see as drawn, such as text on a toast's inverted surface, which sets its
 * own text.) Grouped by what draws the text, what it sits on and the mode.
 * @param {Look} look
 * @returns {{problems: LookProblem[], accepted: number}}
 */
function textProblems(look) {
  const {res, base, components} = look;
  /**
   * A side of a pair as drawn: the part's own style, else its token.
   * @param {Record<Mode, Record<string, string>>} tokens
   * @param {Record<string, Record<string, any>>} styles
   * @returns {(p: TextPair, side: 'fg' | 'bg', m: string) => string | null}
   */
  const drawnBy = (tokens, styles) => {
    /** @type {(p: TextPair, side: 'fg' | 'bg', m: string) => string | null} */
    const drawn = (p, side, m) => {
      const mode = /** @type {Mode} */ (m);
      const s = p[side];
      const block = pairBlock(look.map, p);
      // The ground is the part's own fill, else the fill the text's own
      // part paints under it (a header cell's on a card).
      const own =
        side === 'fg'
          ? partValue(styles, s.target, ['color'], mode, block)
          : (ownFill(styles, s.target, mode, block, tokens[mode]) ??
            (p.fg.target !== s.target
              ? ownFill(styles, p.fg.target, mode, block, tokens[mode])
              : null));
      if (own != null) return colorIn(own, tokens[mode], mode) ?? own;
      let tok = s.tokens[0];
      // Core's media surface (a toast, a lightbox) draws the text it holds
      // in its own on-colors: read as the editor reads it.
      if (side === 'fg' && tok)
        tok =
          look.textTokens(p, drawn(p, 'bg', m), tokens[mode], mode)[0] ?? tok;
      if (side === 'fg' && tok) {
        // A text token a part sets for itself wins over the theme's: the
        // text's own part first, then the part it sits on.
        const set =
          partValue(styles, p.fg.target, [tok], mode, block) ??
          partValue(styles, p.bg.target, [tok], mode, block);
        if (set != null) return colorIn(set, tokens[mode], mode) ?? set;
      }
      if (tok) return colorIn(`var(${tok})`, tokens[mode], mode);
      return s.raw;
    };
    return drawn;
  };
  const {problems} = look.contrast(
    drawnBy(res, components),
    drawnBy(base, {}),
    look.modes,
    {
      parseColor,
      ratio,
      alphaOf,
      compositeOver,
      page: (/** @type {Mode} */ m) => colorIn(`var(${PAGE})`, res[m], m),
    },
  );
  /** @type {Map<string, LookProblem>} */
  const out = new Map();
  const drawn = drawnBy(res, components);
  let accepted = 0;
  for (const x of problems) {
    // A pair Core's own look draws as low is not this theme's doing.
    if (/** @type {any} */ (x).base) continue;
    /** @type {TextPair} */
    const p = x.pair;
    const mode = /** @type {Mode} */ (x.mode);
    const block = pairBlock(look.map, p);
    const fg = shown(drawn(p, 'fg', mode), x.ground);
    /** @type {Omit<AcceptRecord, 'reason'> | null} */
    const record = fg
      ? {
          part: p.text,
          ground: p.bg.target ?? 'page',
          ...(block ? {when: block} : {}),
          mode,
          ratio: x.ratio,
          color: hex(fg),
          groundColor: hex(x.ground),
        }
      : null;
    const ownFg = partValue(components, p.fg.target, ['color'], mode, block);
    const ownBg =
      ownFill(components, p.bg.target, mode, block, res[mode]) ??
      (p.fg.target !== p.bg.target
        ? ownFill(components, p.fg.target, mode, block, res[mode])
        : null);
    const bgPart =
      ownFill(components, p.bg.target, mode, block, res[mode]) != null
        ? p.bg.target
        : p.fg.target;
    // A text token the text's part, or the part it sits on, sets for
    // itself draws it: the part's own line, not the theme's token.
    const tok = p.fg.tokens[0] ?? null;
    const tokenPart =
      ownFg == null && tok
        ? ([p.fg.target, p.bg.target].find(
            q => q && partValue(components, q, [tok], mode, block) != null,
          ) ?? null)
        : null;
    const part =
      ownBg != null ? bgPart : ownFg != null ? p.fg.target : tokenPart;
    const token = ownFg == null && !tokenPart ? tok : null;
    const on = ownBg == null ? (p.bg.tokens[0] ?? null) : null;
    // A record keeps only a color the theme's author set: a color the
    // check or compile made that does not read is a fault, never a design.
    const authored =
      ownFg != null ||
      tokenPart != null ||
      (token != null && look.own.has(token));
    if (
      record &&
      authored &&
      look.accepted.some(a => acceptCovers(a, record))
    ) {
      accepted += 1;
      continue;
    }
    const key = `${part ?? ''}|${token ?? ''}|${on ?? ''}|${mode}`;
    const had = out.get(key);
    const where = p.text;
    if (had) {
      if (!had.parts?.includes(where)) had.parts?.push(where);
      if (x.ratio < /** @type {number} */ (had.ratio)) had.ratio = x.ratio;
      if (record) ACCEPT.get(had)?.push(record);
      continue;
    }
    const problem = /** @type {LookProblem} */ ({
      kind: part ? 'part-text' : 'text',
      mode,
      message: '',
      ...(token ? {token} : {}),
      ...(on ? {on} : {}),
      ...(part ? {part} : {}),
      parts: [where],
      ratio: x.ratio,
      needs: TEXT,
    });
    out.set(key, problem);
    ACCEPT.set(problem, record ? [record] : []);
  }
  for (const p of out.values()) {
    const what = p.part
      ? `text in ${p.part}'s own style`
      : `${p.token ?? 'text'} on ${p.on ?? 'its part'}`;
    p.message = `${what} is ${p.ratio}:1 in ${p.mode} (needs ${TEXT}), in ${(p.parts ?? []).slice(0, 3).join(', ')}${(p.parts ?? []).length > 3 ? ` and ${(p.parts ?? []).length - 3} more` : ''}`;
  }
  return {problems: [...out.values()], accepted};
}

/**
 * The parts with the menu fill, each with the shadow tokens it reads: what
 * sets a menu apart from what it opens over.
 * @param {Look['map']} map
 * @returns {Array<{part: string, shadows: string[]}>}
 */
function menuParts(map) {
  /** @type {Array<{part: string, shadows: string[]}>} */
  const out = [];
  for (const [part, rec] of Object.entries(map)) {
    const own = rec?.own ?? {};
    const fill = Object.entries(own).some(
      ([prop, v]) => /^background/.test(prop) && POPOVER in (v.tokens ?? {}),
    );
    if (fill)
      out.push({
        part,
        shadows: Object.keys(own['box-shadow']?.tokens ?? {}).sort(),
      });
  }
  return out;
}

/** A shadow, border or width value that draws nothing. @param {unknown} v */
const drawsNothing = v => /^(none|0|0px|hidden)?$/.test(String(v ?? '').trim());

/**
 * The menus that stand apart from nothing in a mode: no shadow drawn (a
 * part style that removes it, or every shadow token it reads flat) and no
 * border of its own, on a fill like the page's. Split by what flattens
 * them: the shadow tokens, or the part's own style.
 * @param {Look} look @param {Mode} m @param {(fill: Rgb) => boolean} likePage
 * @returns {{tokens: string[], parts: string[]}}
 */
function flatMenus(look, m, likePage) {
  const {res, components} = look;
  const page = shown(colorIn(`var(${PAGE})`, res[m], m), null);
  /** @type {Set<string>} */
  const tokens = new Set();
  /** @type {string[]} */
  const parts = [];
  for (const {part, shadows} of menuParts(look.map)) {
    const own = (/** @type {string[]} */ keys) =>
      partValue(components, part, keys, m);
    const fill = shown(
      colorIn(
        own(['backgroundColor', 'background']) ?? `var(${POPOVER})`,
        res[m],
        m,
      ),
      page,
    );
    if (!fill || !likePage(fill)) continue;
    const width = own(['borderWidth']);
    const border =
      (own(['border']) != null && !drawsNothing(own(['border']))) ||
      (width != null &&
        !drawsNothing(width) &&
        !drawsNothing(own(['borderStyle']) ?? 'none'));
    if (border) continue;
    const shadow = own(['boxShadow']);
    if (shadow != null) {
      if (drawsNothing(colorlessValue(res[m], '', shadow))) parts.push(part);
      continue;
    }
    if (
      shadows.length &&
      shadows.every(t => drawsNothing(colorlessValue(res[m], t)))
    )
      for (const t of shadows) tokens.add(t);
  }
  return {tokens: [...tokens].sort(), parts};
}

/**
 * The style block a pair is drawn in: its own variant, else the one
 * variant of its part whose fill reads the pair's ground token (a Button
 * drawn as its default variant), else `selected` for a fill drawn only
 * when selected, else none (the plain block).
 * @param {Look['map']} map @param {TextPair} p
 * @returns {string | null}
 */
function pairBlock(map, p) {
  const when = /** @type {any} */ (p).when;
  if (when) return String(when).replace(/^(\w+)=/, '$1:');
  const q = p.bg.target;
  const tok = p.bg.tokens[0];
  if (!q || !tok) return null;
  const own = map[q]?.own ?? {};
  const conds = [
    ...(own['background-color']?.tokens?.[tok] ?? []),
    ...(own.background?.tokens?.[tok] ?? []),
  ];
  // A fill drawn only in the selected state (a selected row's): the
  // theme's `selected` style draws it.
  const selected =
    conds.length > 0 && conds.every(c => /(?:^|,)selected=selected\b/.test(c));
  if (q !== p.fg.target) return selected ? 'selected' : null;
  // The variants that draw the fill at rest (not selected, not under the
  // pointer), when there are any.
  const rest = conds.filter(c => !/selected=|:/.test(c));
  const variants = new Set(
    (rest.length ? rest : conds)
      .map(c => /(?:^|,)variant=([\w-]+)/.exec(c)?.[1])
      .filter(Boolean),
  );
  if (variants.size === 1) return `variant:${[...variants][0]}`;
  return selected ? 'selected' : null;
}

/**
 * The style blocks of the parts inside a bar whose text failed, by bar
 * problem: `part|block`, the block `base` or a variant (`variant:primary`).
 * The repair writes only there.
 * @type {WeakMap<LookProblem, Set<string>>}
 */
const BAR_BLOCKS = new WeakMap();

/**
 * Bar text: a part whose own style sets a text token sets it for every
 * part inside it. A part inside it that paints its own fill (a menu, a
 * field) then draws that text on its fill.
 * @param {Look} look
 * @returns {LookProblem[]}
 */
function barTextProblems(look) {
  const {res, components, map, pairs} = look;
  /** @type {Map<string, LookProblem>} */
  const out = new Map();
  /** The menus: text the census draws inside one sits on the menu. */
  const menus = new Set(menuParts(map).map(({part: menu}) => menu));
  /** Whether the census drew a pair's text inside a menu. @param {TextPair} p */
  const inMenu = p =>
    menus.has(String(p.bg.target)) ||
    /** @type {any} */ (p.within ?? []).some((/** @type {string} */ w) =>
      menus.has(w),
    );
  for (const [part, blocks] of Object.entries(components ?? {})) {
    if (!blocks || typeof blocks !== 'object') continue;
    const within = inside(map, part);
    if (!within.size) continue;
    for (const m of look.modes) {
      const page = shown(colorIn(`var(${PAGE})`, res[m], m), null);
      // What the bar paints: a see-through fill inside it shows the bar.
      const bar =
        shown(
          colorIn(
            partValue(components, part, ['backgroundColor', 'background'], m),
            res[m],
            m,
          ),
          page,
        ) ?? page;
      const style = blocks.base ?? {};
      const tokens = new Set(
        [...Object.keys(style), ...Object.keys(style[`@${m}`] ?? {})].filter(
          k => TEXT_TOKEN.test(k),
        ),
      );
      for (const token of tokens) {
        // (Text drawn disabled has no reading floor.)
        if (/disabled/.test(token)) continue;
        const set = partValue(components, part, [token], m);
        const fg = shown(colorIn(set, res[m], m), bar);
        if (!fg) continue;
        for (const p of pairs) {
          const q = p.bg.target;
          if (!q || q === part || !within.has(q) || p.fg.tokens[0] !== token)
            continue;
          const block = pairBlock(map, p);
          // A part that sets the token again for itself draws its own.
          if (partValue(components, q, [token], m, block) != null) continue;
          const fillValue =
            partValue(
              components,
              q,
              ['backgroundColor', 'background'],
              m,
              block,
            ) ??
            // (A fill token the bar sets for its own parts draws them.)
            (p.bg.tokens[0]
              ? (partValue(components, part, [p.bg.tokens[0]], m) ??
                `var(${p.bg.tokens[0]})`)
              : p.bg.raw);
          // A see-through fill (a segmented control's track) shows the bar
          // through it: its text is measured on the two laid together, and
          // it is never repaired as a fill of the part's own.
          const own = colorIn(fillValue, res[m], m);
          if (own == null) continue;
          const sheer = alphaOf(own) < 1;
          // (A part a menu holds sits on the menu's own fill, not the bar.)
          if (sheer && inMenu(p)) continue;
          const fill = shown(own, bar);
          if (!fill) continue;
          const r = ratio(fg, fill);
          if (r >= TEXT) continue;
          const key = `${part}|${token}|${m}`;
          const had = out.get(key);
          const at = `${q}|${block ?? 'base'}`;
          if (had) {
            if (!had.parts?.includes(q)) had.parts?.push(q);
            if (r < /** @type {number} */ (had.ratio)) had.ratio = fixed(r);
            if (!sheer) BAR_BLOCKS.get(had)?.add(at);
            continue;
          }
          const problem = /** @type {LookProblem} */ ({
            kind: 'bar-text',
            mode: m,
            message: '',
            part,
            token,
            parts: [q],
            ratio: fixed(r),
            needs: TEXT,
          });
          out.set(key, problem);
          BAR_BLOCKS.set(problem, new Set(sheer ? [] : [at]));
        }
      }
    }
  }
  // A fill the bar sets for what it holds (a lighter `--color-neutral`
  // for its buttons): the text the parts draw on it, their own or the
  // bar's, must read there.
  for (const [part, blocks] of Object.entries(components ?? {})) {
    if (!blocks || typeof blocks !== 'object') continue;
    const within = inside(map, part);
    if (!within.size) continue;
    for (const m of look.modes) {
      const page = shown(colorIn(`var(${PAGE})`, res[m], m), null);
      const bar =
        shown(
          colorIn(
            partValue(components, part, ['backgroundColor', 'background'], m),
            res[m],
            m,
          ),
          page,
        ) ?? page;
      const style = blocks.base ?? {};
      const fills = [
        ...Object.keys(style),
        ...Object.keys(style[`@${m}`] ?? {}),
      ].filter(k => /^--color-/.test(k) && !TEXT_TOKEN.test(k));
      for (const token of fills) {
        const value = partValue(components, part, [token], m);
        for (const p of pairs) {
          const q = p.bg.target;
          if (!q || q === part || !within.has(q) || p.bg.tokens[0] !== token)
            continue;
          const block = pairBlock(map, p);
          if (
            partValue(
              components,
              q,
              ['backgroundColor', 'background', token],
              m,
              block,
            ) != null
          )
            continue;
          // A fill that is see-through over the bar (its track tint) is the
          // bar showing through: its text is measured on the two laid
          // together, and it is never repaired as a fill of the part's own.
          const tint = colorIn(value, res[m], m);
          if (tint == null) continue;
          const sheer = alphaOf(tint) < 1;
          if (sheer && inMenu(p)) continue;
          const fill = shown(tint, bar);
          const tok = p.fg.tokens[0];
          if (/disabled/.test(tok ?? '')) continue;
          const text =
            partValue(components, p.fg.target, ['color'], m, block) ??
            (tok
              ? (partValue(components, p.fg.target, [tok], m, block) ??
                partValue(components, q, [tok], m, block) ??
                partValue(components, part, [tok], m) ??
                `var(${tok})`)
              : null);
          const fg = fill ? shown(colorIn(text, res[m], m), fill) : null;
          if (!fill || !fg) continue;
          const r = ratio(fg, fill);
          if (r >= TEXT) continue;
          const key = `fill|${part}|${token}|${m}`;
          const had = out.get(key);
          if (had) {
            if (!had.parts?.includes(q)) had.parts?.push(q);
            if (r < /** @type {number} */ (had.ratio)) had.ratio = fixed(r);
            if (!sheer) BAR_BLOCKS.get(had)?.add(`${q}|${block ?? 'base'}`);
            continue;
          }
          const problem = /** @type {LookProblem} */ ({
            kind: 'bar-fill',
            mode: m,
            message: '',
            part,
            token,
            parts: [q],
            ratio: fixed(r),
            needs: TEXT,
          });
          out.set(key, problem);
          BAR_BLOCKS.set(
            problem,
            new Set(sheer ? [] : [`${q}|${block ?? 'base'}`]),
          );
        }
      }
    }
  }
  // Text a part inside a page bar draws on the bar's own fill (the part
  // paints none of its own): the text, its own or the bar's, must read on
  // the bar.
  for (const part of PAGE_BARS) {
    const blocks = components?.[part];
    if (!blocks || typeof blocks !== 'object') continue;
    const within = inside(map, part);
    for (const m of look.modes) {
      const page = shown(colorIn(`var(${PAGE})`, res[m], m), null);
      const barValue = ownFill(components, part, m, null, res[m]);
      // A bar painted with one opaque gradient is measured where centered
      // text sits on it, as the contrast measure reads a gradient.
      const barColor =
        barValue != null && /gradient\(/.test(barValue)
          ? fillStops(barValue)
            ? gradientColorBehindText(barValue, {parseColor, alphaOf})
            : null
          : barValue;
      const barRgb =
        barColor != null ? shown(colorIn(barColor, res[m], m), page) : null;
      if (!barRgb) continue;
      /** @type {Rgb[]} */
      const bars = [barRgb];
      for (const p of pairs) {
        const q = p.bg.target;
        // The text sits in the bar: its part is one the bar holds, or the
        // census drew it inside the bar.
        const sits =
          within.has(String(p.fg.target)) ||
          /** @type {any} */ (p.within ?? []).includes(part);
        // (Text on the bar's own fill is measured with the bar's fill;
        // text in a menu the bar opens sits on the menu's own fill; text
        // drawn disabled has no reading floor.)
        if (!q || q === part || !sits) continue;
        if (inMenu(p)) continue;
        if (/disabled/.test(p.fg.tokens[0] ?? '')) continue;
        const block = pairBlock(map, p);
        // A ground inside the bar that paints its own fill is the text's;
        // a ground outside it (the page the census drew) is under the bar.
        // A see-through ground inside the bar (a segmented control's
        // track) lays its tint over the bar: the text is measured on that.
        let grounds = bars;
        if (within.has(q)) {
          if (ownFill(components, q, m, block, res[m]) != null) continue;
          const fillToken = p.bg.tokens[0];
          const fillValue = fillToken
            ? (partValue(components, q, [fillToken], m, block) ??
              partValue(components, part, [fillToken], m) ??
              `var(${fillToken})`)
            : p.bg.raw;
          const c = colorIn(fillValue, res[m], m);
          if (c != null && alphaOf(c) >= 1) continue;
          if (c != null && alphaOf(c) > 0)
            grounds = bars
              .map(b => shown(c, b))
              .filter(/** @returns {g is Rgb} */ g => g != null);
          if (!grounds.length) continue;
        }
        const tok = p.fg.tokens[0];
        // (A text token the text's own part sets wins over the bar's.)
        const ownText =
          tok != null &&
          partValue(components, p.fg.target, [tok], m, block) != null;
        const text =
          partValue(components, p.fg.target, ['color'], m, block) ??
          (tok
            ? (partValue(components, p.fg.target, [tok], m, block) ??
              partValue(components, q, [tok], m, block) ??
              partValue(components, part, [tok], m) ??
              `var(${tok})`)
            : null);
        const fg = shown(colorIn(text, res[m], m), grounds[0]);
        if (!fg) continue;
        const r = Math.min(...grounds.map(b => ratio(fg, b)));
        if (r >= TEXT) continue;
        const key = `ground|${part}|${tok}|${m}`;
        const had = out.get(key);
        if (had) {
          if (!had.parts?.includes(p.text)) had.parts?.push(p.text);
          if (r < /** @type {number} */ (had.ratio)) had.ratio = fixed(r);
          continue;
        }
        const problem = /** @type {LookProblem} */ ({
          kind: 'bar-ground',
          mode: m,
          message: ownText ? `own:${p.fg.target}` : '',
          part,
          ...(tok ? {token: tok} : {}),
          parts: [p.text],
          ratio: fixed(r),
          needs: TEXT,
        });
        out.set(key, problem);
      }
    }
  }
  for (const p of out.values()) {
    const groups = [...new Set((p.parts ?? []).map(q => familyOf(q) ?? q))];
    if (p.kind === 'bar-ground') {
      const own = p.message.startsWith('own:') ? p.message.slice(4) : null;
      p.message = `text of ${(p.parts ?? []).slice(0, 3).join(', ')} sits on ${p.part}'s own fill at ${p.ratio}:1 in ${p.mode}${
        own
          ? `: ${own}'s own style sets ${p.token}, which wins over the bar's; take it out of ${own}'s style so the text follows ${p.part}, or give it a color that reads on both`
          : p.token
            ? `: set ${p.token} in ${p.part}'s own style to a color that reads there`
            : ''
      }`;
      continue;
    }
    // Parts that show the bar through a see-through fill are not
    // repaired: the edit is the text they draw there.
    if (!BAR_BLOCKS.get(p)?.size) {
      const first = (p.parts ?? [])[0];
      p.message =
        p.kind === 'bar-fill'
          ? `${p.part} sets ${p.token}, a see-through fill ${(p.parts ?? []).slice(0, 3).join(', ')} inside it lay over its own: their text reads at ${p.ratio}:1 on the two in ${p.mode}. Change ${p.token} in ${p.part}'s own style so their text reads on it`
          : `${p.part} sets ${p.token}, so ${(p.parts ?? []).slice(0, 3).join(', ')} inside it draw that text on their see-through fill laid over ${p.part}: ${p.ratio}:1 in ${p.mode}. Set ${p.token} in ${first}'s own style to a color that reads there, or give ${first} a fill of its own`;
      continue;
    }
    p.message =
      p.kind === 'bar-fill'
        ? `${p.part} sets ${p.token}, so ${(p.parts ?? []).slice(0, 3).join(', ')} inside it draw their text on that fill: ${p.ratio}:1 in ${p.mode}. The fix sets the theme's own ${p.token} again on ${groups.join(', ')}`
        : `${p.part} sets ${p.token}, so ${(p.parts ?? []).slice(0, 3).join(', ')} inside it draw that text on their own fill: ${p.ratio}:1 in ${p.mode}. The fix sets the theme's own ${p.token} again on ${groups.join(', ')}`;
  }
  return [...out.values()];
}

/**
 * Text on a selected part's own fill: a part whose `selected` style paints
 * it (a selected row) holds text its census pairs measure only at rest.
 * Each pair drawn in the part, or in a part inside it, is measured again
 * on the selected fill, with the text the selected style gives.
 * @param {Look} look
 * @returns {LookProblem[]}
 */
function selectedProblems(look) {
  const {res, components, pairs} = look;
  /** @type {Map<string, LookProblem>} */
  const out = new Map();
  for (const [part, blocks] of Object.entries(components ?? {})) {
    const sel = /** @type {any} */ (blocks)?.selected;
    if (!sel || typeof sel !== 'object') continue;
    for (const m of look.modes) {
      const fillValue = partValue(
        components,
        part,
        ['backgroundColor', 'background'],
        m,
        'selected',
      );
      if (fillValue == null) continue;
      /** @type {Record<string, string>} */
      const tokens = {...res[m]};
      for (const inner of [sel, sel[`@${m}`]])
        if (inner && typeof inner === 'object')
          for (const [k, v] of Object.entries(inner))
            if (k.startsWith('--') && typeof v === 'string') tokens[k] = v;
      const page = shown(colorIn(`var(${PAGE})`, tokens, m), null);
      const fill = shown(colorIn(fillValue, tokens, m), page);
      if (!fill) continue;
      // A part that holds free content (a table cell) shows any of it.
      const holdsContent = (look.map[part]?.contains ?? []).some(q =>
        CONTENT_HOLDERS.includes(q),
      );
      for (const p of pairs) {
        const within = /** @type {any} */ (p).within ?? [];
        const content =
          holdsContent &&
          CONTENT_PARTS.includes(String(p.fg.target)) &&
          p.bg.target === p.fg.target;
        if (p.bg.target !== part && !within.includes(part) && !content)
          continue;
        if (p.fg.target === part && p.bg.target === part) continue;
        const block = pairBlock(look.map, p);
        // The pair's own ground when it is a part inside the selected one
        // (see-through over the selected fill); else the selected fill
        // covers it.
        const inner =
          content ||
          (look.map[part]?.contains ?? []).includes(String(p.bg.target));
        const groundValue = !inner
          ? null
          : (partValue(
              components,
              p.bg.target,
              ['backgroundColor', 'background'],
              m,
              block,
            ) ?? (p.bg.tokens[0] ? `var(${p.bg.tokens[0]})` : p.bg.raw));
        const ground = groundValue
          ? (shown(colorIn(groundValue, tokens, m), fill) ?? fill)
          : fill;
        const tok = p.fg.tokens[0];
        const text =
          partValue(components, p.fg.target, ['color'], m, block) ??
          (tok
            ? (partValue(components, p.fg.target, [tok], m, block) ??
              `var(${tok})`)
            : null);
        const fg = shown(colorIn(text, tokens, m), ground);
        if (!fg) continue;
        const r = ratio(fg, ground);
        if (r >= TEXT) continue;
        const key = `${part}|${m}`;
        const had = out.get(key);
        if (had) {
          if (!had.parts?.includes(p.text)) had.parts?.push(p.text);
          if (r < /** @type {number} */ (had.ratio)) had.ratio = fixed(r);
          continue;
        }
        out.set(key, {
          kind: 'part-text',
          mode: m,
          message: '',
          part,
          parts: [p.text],
          ratio: fixed(r),
          needs: TEXT,
        });
      }
    }
  }
  for (const p of out.values())
    p.message = `text on ${p.part}'s selected fill is ${p.ratio}:1 in ${p.mode} (needs ${TEXT}), in ${(p.parts ?? []).slice(0, 3).join(', ')}: give those parts text that reads in ${p.part}'s selected style`;
  return [...out.values()];
}

/**
 * Text on a hover fill a part's own style gives (`':hover':
 * {backgroundColor}`): measured with the text the part draws there, in
 * each mode, as Core's census measures it only at rest.
 * @param {Look} look
 * @returns {LookProblem[]}
 */
function hoverTextProblems(look) {
  const {res, components, pairs} = look;
  /** @type {Map<string, LookProblem>} */
  const out = new Map();
  for (const p of pairs) {
    const part = p.fg.target;
    if (!part || p.bg.target !== part) continue;
    const block = pairBlock(look.map, p);
    for (const m of look.modes) {
      const fillValue = ownHover(components, part, m, block);
      if (fillValue == null) continue;
      // The tokens the part's own block sets, over the theme's.
      /** @type {Record<string, string>} */
      const tokens = {...res[m]};
      for (const b of ['base', block])
        for (const inner of [
          b ? components?.[part]?.[b] : null,
          b ? components?.[part]?.[b]?.[`@${m}`] : null,
        ])
          if (inner && typeof inner === 'object')
            for (const [k, v] of Object.entries(inner))
              if (k.startsWith('--') && typeof v === 'string') tokens[k] = v;
      const page = shown(colorIn(`var(${PAGE})`, tokens, m), null);
      const fill = shown(colorIn(fillValue, tokens, m), page);
      const hover = /** @type {any} */ (
        components?.[part]?.[block ?? 'base'] ?? components?.[part]?.base
      )?.[':hover'];
      const tok = p.fg.tokens[0];
      const text =
        (hover && typeof hover.color === 'string' ? hover.color : null) ??
        partValue(components, part, ['color'], m, block) ??
        (tok ? `var(${tok})` : null);
      const fg = fill ? shown(colorIn(text, tokens, m), fill) : null;
      if (!fill || !fg) continue;
      const r = ratio(fg, fill);
      if (r >= TEXT) continue;
      const name = `${part}${block ? ` (${block})` : ''}`;
      const key = `${name}|${m}`;
      if (out.has(key)) continue;
      out.set(key, {
        kind: 'part-text',
        mode: m,
        part,
        parts: [name],
        ratio: fixed(r),
        needs: TEXT,
        message: `text on ${name}'s hover fill is ${fixed(r)}:1 in ${m} (needs ${TEXT}): give its ':hover' style text that reads, or a fill for each mode`,
      });
    }
  }
  return [...out.values()];
}

/**
 * Whether a background value paints an image or a gradient: a `url()` or
 * any gradient, each `var()` read from the theme's tokens (its own local
 * ones included).
 * @param {string} v @param {Record<string, string>} tokens
 */
function isPattern(v, tokens) {
  const value = withTokens(v, tokens);
  return /url\(|gradient\(/.test(value);
}

/**
 * Text on an image a part's own style paints (a `url()` background): it is
 * not measured, so it is said, never passed as clean.
 * @param {Look} look
 * @returns {LookProblem[]}
 */
function partImageProblems(look) {
  /** @type {LookProblem[]} */
  const out = [];
  for (const [part, blocks] of Object.entries(look.components ?? {})) {
    if (!blocks || typeof blocks !== 'object') continue;
    /** Whether the part sets a fill of its own in a mode. @param {Mode} m */
    const setsFill = m =>
      Object.values(blocks).some(
        (/** @type {any} */ b) =>
          b &&
          typeof b === 'object' &&
          [b, b[`@${m}`]].some(
            x => x && typeof x === 'object' && x.backgroundColor != null,
          ),
      );
    // Each mode decides on its own: a gradient can be opaque in one mode
    // and see-through in the other.
    // Every block the part draws in (a `height:fill` layout, a selected
    // row), not only the plain one.
    const drawnIn = [
      null,
      ...Object.keys(blocks).filter(k => k !== 'base' && !/^[:@]/.test(k)),
    ];
    const unread = look.modes.filter(m =>
      drawnIn.some(block => imageUnread(m, block)),
    );
    /** @param {Mode} m @param {string | null} block */
    function imageUnread(m, block) {
      const v = partValue(
        look.components,
        part,
        ['backgroundImage', 'background'],
        m,
        block,
      );
      if (typeof v !== 'string' || !isPattern(v, look.res[m])) return false;
      if (/url\(/.test(v)) return true;
      const read = withTokens(v, look.res[m], m);
      // One opaque gradient is measured as the fill.
      if (opaqueGradient(read)) return false;
      // A see-through sheen over a fill the part sets is measured on that
      // fill; a variable the theme's tokens do not answer leaves it unread.
      return /var\(/.test(read) || !setsFill(m);
    }
    if (!unread.length) continue;
    out.push({
      kind: 'page-image',
      mode: unread.length === look.modes.length ? 'both' : unread[0],
      part,
      message: `${part} paints an image under its content${unread.length === look.modes.length ? '' : ` in ${unread[0]}`}; text on it is not measured: give text on it a plain fill, or check it by eye`,
    });
  }
  return out;
}

/** Controls an app may put in any bar of the page. */
const FREE_PARTS = [
  'segmented-control',
  'segmented-control-item',
  'tab',
  'badge',
  'token',
  'button',
  'icon-button',
  'text-input',
  'power-search',
  'tokenizer',
];
/** The bars and panels a page is built from. */
const PAGE_BARS = [
  'app-shell-header',
  'layout-header',
  'layout-footer',
  'layout-panel',
  'top-nav',
  'side-nav',
];
/** Parts that hold whatever content an app puts in them. */
const CONTENT_HOLDERS = ['table-cell', 'list-item'];
/** Content parts an app puts in a cell: their text, on their own fill. */
const CONTENT_PARTS = ['badge', 'token', 'text'];

/** The OKLab step a hover changes a fill by that a person sees at a glance. */
const HOVER_SHOWS = 0.02;
/** A hover that changes a fill by less than this OKLab step looks the same. */
const HOVER_SAME = 0.01;

/**
 * The hover fill a part's own style gives in a block, or null.
 * @param {Look['components']} components
 * @param {string} part @param {Mode} m @param {string | null} block
 * @param {string} [state] the state's own key (`:hover`, `:active`)
 */
function ownHover(components, part, m, block, state = ':hover') {
  for (const b of [block, 'base']) {
    const hover = b ? components?.[part]?.[b]?.[state] : null;
    if (!hover || typeof hover !== 'object') continue;
    for (const inner of [hover[`@${m}`], hover])
      if (inner && typeof inner === 'object')
        for (const k of ['backgroundColor', 'background'])
          if (typeof inner[k] === 'string') return inner[k];
  }
  return null;
}

/**
 * Hover that shows nothing: a part Core paints differently under the
 * pointer (its own hover fill, or the hover overlay over its fill) that the
 * theme paints the same as at rest. Read from the states the part data
 * records, per variant; measured on the fill a painted part around it
 * gives, else the page.
 * @param {Look} look
 * @returns {LookProblem[]}
 */
function hoverProblems(look) {
  const {res, base, components, map} = look;
  /** @type {Map<string, LookProblem>} */
  const out = new Map();
  /** The painted part a part sits in, its fill. @param {string} part @param {Mode} m */
  const around = (part, m) => {
    for (const [outer, rec] of Object.entries(map)) {
      if (!(rec?.contains ?? []).includes(part)) continue;
      const v = partValue(
        components,
        outer,
        ['backgroundColor', 'background'],
        m,
      );
      if (v != null) return colorIn(v, res[m], m);
    }
    return null;
  };
  /**
   * The theme's tokens as a part inside a painted part reads them: with the
   * custom properties the painted part's own style sets (a dark card's own
   * hover tint) over the theme's.
   * @param {string} part @param {Mode} m
   */
  const aroundTokens = (part, m) => {
    for (const [outer, rec] of Object.entries(map)) {
      if (!(rec?.contains ?? []).includes(part)) continue;
      const style = components?.[outer]?.base;
      if (!style || typeof style !== 'object') continue;
      /** @type {Record<string, string>} */
      const vars = {};
      for (const inner of [style, style[`@${m}`]])
        if (inner && typeof inner === 'object')
          for (const [k, v] of Object.entries(inner))
            if (k.startsWith('--') && typeof v === 'string') vars[k] = v;
      if (Object.keys(vars).length) return {...res, [m]: {...res[m], ...vars}};
    }
    return res;
  };
  for (const [part, rec] of Object.entries(map)) {
    const at = rec?.at?.['background-color'] ?? {};
    // A hover is a fill that replaces the part's own, or a layer drawn
    // over it: a `::before`, or a one-color background image (a Button's).
    /** @type {Array<{key: string, value: string, layer: boolean}>} */
    const hovers = [];
    for (const [key, value] of Object.entries(at))
      if (/:(hover|active)(::before)?$/.test(key))
        hovers.push({key, value, layer: key.endsWith('::before')});
    for (const [key, value] of Object.entries(
      rec?.at?.['background-image'] ?? {},
    )) {
      const flat = /^linear-gradient\((.+),\s*\1\)$/.exec(
        String(value).replace(/\s+/g, ''),
      );
      if (/:(hover|active)$/.test(key) && flat)
        hovers.push({key, value: flat[1], layer: true});
    }
    for (const {key, value, layer} of hovers) {
      const hovered = /^(.*?)\s*:(hover|active)(::before)?$/.exec(key);
      if (!hovered) continue;
      const pressed = hovered[2] === 'active';
      const restKey = hovered[1] || 'always';
      const variant = /(?:^|,)variant=([\w-]+)/.exec(restKey)?.[1];
      const block = variant ? `variant:${variant}` : null;
      for (const m of look.modes) {
        /**
         * The rest and hover paint, opaque, with a theme's tokens and styles.
         * @param {Record<Mode, Record<string, string>>} tokens
         * @param {Look['components']} styles @param {string | null} ground
         */
        const paints = (tokens, styles, ground) => {
          const page = shown(colorIn(`var(${PAGE})`, tokens[m], m), null);
          const under = shown(ground, page) ?? page;
          const restValue =
            partValue(
              styles,
              part,
              ['backgroundColor', 'background'],
              m,
              block,
            ) ??
            at[restKey] ??
            'transparent';
          const rest = shown(colorIn(restValue, tokens[m], m), under) ?? under;
          // Core's hover sits in its base layer, under the theme's part
          // rules: a fill the part's own style gives at rest, with no hover
          // of its own, stays under the pointer.
          const ownRest = partValue(
            styles,
            part,
            ['backgroundColor', 'background'],
            m,
            block,
          );
          const hoverValue =
            ownHover(styles, part, m, block, pressed ? ':active' : ':hover') ??
            (ownRest != null && !layer ? ownRest : value);
          const c = colorIn(hoverValue, tokens[m], m);
          const top = c ? /** @type {Rgb} */ (parseColor(c)) : null;
          const hover =
            top && rest ? compositeOver(top, alphaOf(c), rest) : rest;
          return rest && hover
            ? {
                d: oklabDistance(rest, hover),
                rest,
                hover,
                alpha: c ? alphaOf(c) : 0,
              }
            : null;
        };
        const theme = paints(
          aroundTokens(part, m),
          components,
          around(part, m),
        );
        const core = paints(base, {}, null);
        if (theme == null || core == null) continue;
        // Text on the state's fill, as the theme draws it: it read at rest
        // and must read under the pointer or the press too.
        const stateName = pressed ? 'press' : 'hover';
        // (A light tint over the rest fill moves text little: a state that
        // paints a fill of its own is the one that can hide it.)
        for (const pr of theme.alpha >= 0.5 ? look.pairs : []) {
          if (pr.fg.target !== part || pairBlock(map, pr) !== block) continue;
          if (/disabled/.test(pr.fg.tokens[0] ?? '')) continue;
          const tokens = aroundTokens(part, m)[m];
          const tok = pr.fg.tokens[0];
          const textValue =
            partValue(components, part, ['color'], m, block) ??
            (tok
              ? (partValue(components, part, [tok], m, block) ?? `var(${tok})`)
              : null);
          const fg = shown(colorIn(textValue, tokens, m), theme.hover);
          if (!fg) continue;
          const r = ratio(fg, theme.hover);
          // A state is passed in a moment: text on it is a problem when it
          // falls below 3:1 and below 95% of Core's own on the same state
          // (Core's own state fills sit under 4.5:1 too).
          const coreFg = tok
            ? shown(colorIn(`var(${tok})`, base[m], m), core.hover)
            : null;
          const floor = Math.min(
            NON_TEXT,
            coreFg ? EDGE_SHARE * ratio(coreFg, core.hover) : NON_TEXT,
          );
          if (r + 0.005 >= floor || ratio(fg, theme.rest) < TEXT) continue;
          const sk = `${stateName}|${part}|${block ?? ''}|${m}`;
          if (out.has(sk)) continue;
          out.set(sk, {
            kind: 'part-text',
            mode: m,
            part,
            ...(tok ? {token: tok} : {}),
            parts: [`${part}${variant ? ` (${block})` : ''}`],
            ratio: fixed(r),
            needs: fixed(floor),
            message: `text on ${part}${variant ? ` (${block})` : ''}'s ${stateName} fill is ${fixed(r)}:1 in ${m} (needs ${fixed(floor)}), where it reads at rest: give its ':${pressed ? 'active' : 'hover'}' style a fill the text reads on`,
          });
        }
        if (pressed) continue;
        if (core.d < HOVER_SHOWS || theme.d >= HOVER_SAME) continue;
        const name = `${part}${variant ? ` (${block})` : ''}`;
        // Hover the theme's overlay token flattens, with no style of the
        // part's own, is one problem per mode: one line to change.
        const tok = /var\(\s*(--color-overlay-[\w-]+)\s*\)/.exec(value)?.[1];
        // (A layer drawn over the fill shows over a fill the part sets.)
        const ownStyle =
          ownHover(components, part, m, block) != null ||
          (!layer &&
            partValue(
              components,
              part,
              ['backgroundColor', 'background'],
              m,
              block,
            ) != null);
        if (tok && !ownStyle && look.own.has(tok)) {
          const tk = `${tok}|${m}`;
          const had = out.get(tk);
          if (had) {
            if (!had.parts?.includes(name)) had.parts?.push(name);
          } else
            out.set(tk, {
              kind: 'hover',
              mode: m,
              token: tok,
              parts: [name],
              message: '',
            });
          continue;
        }
        const k = `${part}|${block ?? ''}|${m}`;
        if (out.has(k)) continue;
        out.set(k, {
          kind: 'hover',
          mode: m,
          part,
          ...(variant ? {parts: [`${part} (${block})`]} : {}),
          message: `${part}${variant ? ` (${block})` : ''} looks the same under the pointer as at rest in ${m}, where Core's own changes`,
        });
      }
    }
  }
  for (const p of out.values())
    if (p.kind === 'hover' && p.token)
      p.message = `nothing changes under the pointer in ${p.mode} on ${(p.parts ?? []).length} parts (${(p.parts ?? []).slice(0, 3).join(', ')}${(p.parts ?? []).length > 3 ? ', …' : ''}), where Core's own does: the theme sets ${p.token} to show nothing`;
  return [...out.values()];
}

/**
 * Font families the theme names that nothing loads and that end in no
 * generic family: the browser then shows its default serif.
 * @param {Look} look
 * @returns {LookProblem[]}
 */
function fontProblems(look) {
  /** @type {LookProblem[]} */
  const out = [];
  for (const t of [...look.own].filter(x => /^--font-family/.test(x)).sort()) {
    const value = String(look.res.light[t] ?? '');
    if (!value) continue;
    // A font the app does not load, with a generic after it: the page
    // shows the generic, and the theme's look is lost.
    const fonts = look.app?.themed ? look.app.fonts : null;
    if (hasGenericFamily(value)) {
      const lost = namedFontFamilies(value)
        .filter(f =>
          look.unloadedFonts.some(u => u.toLowerCase() === f.toLowerCase()),
        )
        .filter(f => fonts && !fonts.has(fontKey(f)));
      if (lost.length) {
        const font = look.fontInstall(lost[0]);
        out.push({
          kind: 'font-unloaded',
          mode: 'both',
          token: t,
          message: `${t} names ${lost.join(', ')}, which the app does not load, so the page shows the fallback${font ? `: ${font.known ? '' : 'if Fontsource publishes it, '}${font.install} installs it, and import '${font.pkg}'; in ${look.app?.entry ?? "the file that loads Core's stylesheet"} loads it` : ''}`,
        });
      }
      continue;
    }
    const missing = namedFontFamilies(value).filter(f =>
      look.unloadedFonts.some(u => u.toLowerCase() === f.toLowerCase()),
    );
    if (!missing.length) continue;
    out.push({
      kind: 'font',
      mode: 'both',
      token: t,
      message: `${t} names ${missing.join(', ')}, which nothing loads, and no generic family after it: the browser shows its default serif`,
    });
  }
  return out;
}

/**
 * The generic family Core's own value of a font token ends in, or null.
 * @param {Look} look @param {string} t
 */
function coreGeneric(look, t) {
  const families = String(look.base.light[t] ?? look.defaults[t] ?? '')
    .split(',')
    .map(f => f.trim())
    .filter(Boolean);
  return families.reverse().find(f => !namedFontFamilies(f).length) ?? null;
}

/**
 * The contrast a control edge needs on a surface in a mode: EDGE_SHARE of
 * Core's own edge's on Core's same surface, and 3:1 always enough; null
 * when either is not a color.
 * @param {Look} look @param {string} g @param {Mode} m
 */
function edgeNeeds(look, g, m) {
  const coreEdge = shown(colorIn(`var(${EDGE})`, look.base[m], m), null);
  const coreGround = shown(colorIn(`var(${g})`, look.base[m], m), null);
  if (!coreEdge || !coreGround) return null;
  return Math.min(NON_TEXT, EDGE_SHARE * ratio(coreEdge, coreGround));
}

/**
 * The contrast a chart color needs on a surface in a mode: 95% of Core's
 * own color's on Core's same surface, and 3:1 always enough; null when
 * either is not a color.
 * @param {Look} look @param {string} t @param {string} g @param {Mode} m
 */
function chartFloor(look, t, g, m) {
  const coreGround = shown(colorIn(`var(${g})`, look.base[m], m), null);
  const core = coreGround
    ? shown(colorIn(`var(${t})`, look.base[m], m), coreGround)
    : null;
  if (!core || !coreGround) return null;
  return Math.min(NON_TEXT, EDGE_SHARE * ratio(core, coreGround));
}

/**
 * Chart series that do not show on the surfaces charts sit on (a card, the
 * page): each categorical color against each, below 95% of Core's own
 * color's contrast on Core's same surface, and 3:1 always enough.
 * @param {Look} look
 * @returns {LookProblem[]}
 */
function chartGroundProblems(look) {
  const {res, base} = look;
  /** @type {LookProblem[]} */
  const out = [];
  const series = Object.keys(look.defaults)
    .filter(t => /^--color-data-categorical-/.test(t))
    .sort();
  for (const m of look.modes) {
    const page = shown(colorIn(`var(${PAGE})`, res[m], m), null);
    for (const g of [CARD, PAGE]) {
      const ground = shown(colorIn(`var(${g})`, res[m], m), page);
      const coreGround = shown(colorIn(`var(${g})`, base[m], m), null);
      if (!ground || !coreGround) continue;
      const faint = series.filter(t => {
        const c = shown(colorIn(`var(${t})`, res[m], m), ground);
        const needs = chartFloor(look, t, g, m);
        if (!c || needs == null) return false;
        return ratio(c, ground) + 0.005 < needs;
      });
      if (!faint.length) continue;
      out.push({
        kind: 'chart-ground',
        mode: m,
        on: g,
        token: faint[0],
        parts: faint,
        message: `chart colors barely show on ${g} in ${m}: ${faint.slice(0, 3).join(', ')}${faint.length > 3 ? ` and ${faint.length - 3} more` : ''}`,
      });
    }
  }
  return out;
}

/**
 * Whether a color the theme sets is Core's own, copied: in each mode, the
 * value Core gives it in one of its modes (a dark look that copies Core's
 * dark colors into both).
 * @param {Look} look @param {string} t
 */
function coreCopy(look, t) {
  const at = (
    /** @type {Record<string, string>} */ tokens,
    /** @type {Mode} */ m,
  ) => {
    const c = parseColor(colorIn(`var(${t})`, tokens, m));
    return c ? hex(c) : null;
  };
  const core = new Set(
    /** @type {Mode[]} */ (['light', 'dark']).map(m => at(look.base[m], m)),
  );
  return look.modes.every(m => {
    const v = at(look.res[m], m);
    return v != null && core.has(v);
  });
}

/**
 * Chart colors left at Core's own while the theme sets its own page or
 * accent: the fill derives them from the theme's colors.
 * @param {Look} look
 * @returns {LookProblem[]}
 */
function chartProblems(look) {
  const looks = (/** @type {string} */ t) => t.startsWith('--color-data-');
  if (![PAGE, SURFACE, '--color-accent'].some(t => look.own.has(t))) return [];
  if ([...look.own].some(t => looks(t) && !coreCopy(look, t))) return [];
  const derived = Object.keys(filledColors(look)).filter(looks).sort();
  // The palette cannot derive a set that reads and stays apart here: the
  // charts still keep Core's colors, and only the author can choose them.
  if (!derived.length)
    return [
      {
        kind: 'charts',
        mode: 'both',
        token: '--color-data-categorical-blue',
        message: `charts keep Core's own colors while the theme sets its own, and the theme's colors give no chart set that reads and stays apart: set the --color-data-categorical-* colors yourself`,
      },
    ];
  return [
    {
      kind: 'charts',
      mode: 'both',
      token: derived.find(t => t.startsWith('--color-data-')) ?? derived[0],
      message: `charts keep Core's own colors while the theme sets its own: ${derived.length} chart colors can follow the theme`,
    },
  ];
}

/**
 * Everything a person would see as broken, in each mode, and how many
 * measured pairs the theme's accepted records keep as designed.
 * @param {Look} look
 * @returns {{problems: LookProblem[], accepted: number}}
 */
export function lookProblems(look) {
  const {res, base, modes, own, app} = look;
  const text = textProblems(look);
  /** @type {LookProblem[]} */
  const out = [
    ...text.problems,
    ...barTextProblems(look),
    ...selectedProblems(look),
    ...hoverTextProblems(look),
    ...partImageProblems(look),
    ...hoverProblems(look),
    ...fontProblems(look),
    ...chartProblems(look),
    ...chartGroundProblems(look),
  ];
  for (const m of modes) {
    const at = (/** @type {string} */ t) => colorIn(`var(${t})`, res[m], m);
    const page = shown(at(PAGE), null);
    if (!page) continue;
    const popoverValue = at(POPOVER);
    const popover = shown(popoverValue, page);
    if (popoverValue && alphaOf(popoverValue) < 1)
      out.push({
        kind: 'see-through',
        mode: m,
        token: POPOVER,
        message: `menus and dropdowns are see-through in ${m} (${POPOVER} is ${popoverValue})`,
      });
    const card = shown(at(CARD), page);
    const flat = flatMenus(look, m, fill =>
      [page, card].every(g => !g || oklabDistance(fill, g) < LOOKS_ALIKE),
    );
    if (popover && (flat.tokens.length || flat.parts.length))
      out.push({
        kind: 'blend',
        mode: m,
        ...(flat.tokens.length
          ? {token: flat.tokens[0]}
          : {part: flat.parts[0]}),
        ...(flat.parts.length ? {parts: flat.parts} : {}),
        message: `menus and dialogs blend into the page in ${m}: the same fill as the page and cards, and no shadow (${[
          ...flat.tokens,
          ...flat.parts.map(q => `${q}'s own boxShadow`),
        ].join(', ')})${flat.parts
          .map(q => {
            const shadow =
              menuParts(look.map).find(x => x.part === q)?.shadows[0] ??
              '--shadow-low';
            return `. In ${q}'s style, change boxShadow: 'none' to boxShadow: 'var(${shadow})'`;
          })
          .join('')}`,
      });
    // Control edges: at least EDGE_SHARE of Core's own edge contrast on
    // Core's same ground, and 3:1 always passes.
    const edge = shown(at(EDGE), page);
    if (edge)
      for (const g of GROUNDS) {
        const ground = shown(at(g), page);
        const coreEdge = shown(colorIn(`var(${EDGE})`, base[m], m), null);
        const coreGround = shown(colorIn(`var(${g})`, base[m], m), null);
        if (!ground || !coreEdge || !coreGround) continue;
        const core = ratio(coreEdge, coreGround);
        const needs = /** @type {number} */ (edgeNeeds(look, g, m));
        const r = ratio(edge, ground);
        // (Within rounding of the second decimal the ratios print with.)
        if (r + 0.005 >= needs) continue;
        out.push({
          kind: 'edge',
          mode: m,
          token: EDGE,
          on: g,
          ratio: fixed(r),
          needs: fixed(needs),
          message: `checkbox, switch and field edges barely show on ${g} in ${m}: ${fixed(r)}:1 (Core's own edge there is ${fixed(core)}:1; needs ${fixed(needs)}:1)`,
        });
      }
    // A main surface on the other side of light and dark from the page.
    for (const g of [SURFACE, CARD]) {
      const ground = shown(at(g), page);
      if (!ground || sideOf(ground) === sideOf(page)) continue;
      if (ratio(ground, page) < NON_TEXT) continue;
      out.push({
        kind: 'half-painted',
        mode: m,
        token: g,
        on: PAGE,
        message: `${g} is ${sideOf(ground)} while the page is ${sideOf(page)} in ${m}: the page looks half painted`,
      });
    }
    // A bar or panel of the page whose own fill stays light while the page
    // is dark.
    for (const [part, blocks] of Object.entries(look.components ?? {})) {
      if (!blocks || typeof blocks !== 'object') continue;
      if (!PAGE_BARS.includes(part)) continue;
      const v = partValue(
        look.components,
        part,
        ['backgroundColor', 'background'],
        m,
      );
      const fill = v != null ? shown(colorIn(v, res[m], m), page) : null;
      // (A dark bar over a light page is a look; a light one left over a
      // dark page is a part that did not follow the mode.)
      if (!fill || sideOf(page) !== 'dark' || sideOf(fill) !== 'light')
        continue;
      if (ratio(fill, page) < NON_TEXT) continue;
      out.push({
        kind: 'half-painted',
        mode: m,
        part,
        on: PAGE,
        message: `${part}'s own fill is ${sideOf(fill)} while the page is ${sideOf(page)} in ${m}: the page looks half painted. Give ${part}'s backgroundColor a value for each mode`,
      });
    }
  }
  const same = [PAGE, SURFACE, '--color-text-primary'].every(
    t =>
      colorIn(`var(${t})`, res.light, 'light') ===
      colorIn(`var(${t})`, res.dark, 'dark'),
  );
  const darkPage = shown(colorIn(`var(${PAGE})`, res.dark, 'dark'), null);
  // (A mode set by an expression may pin it: not said.)
  if (
    modes.length > 1 &&
    same &&
    app?.themed &&
    !app.pinned &&
    !app.modeByExpression &&
    darkPage
  ) {
    const lookSide = sideOf(darkPage);
    out.push({
      kind: 'one-look',
      mode: 'both',
      message: `the theme has one ${lookSide} look for both modes, but the app does not pin the mode: in ${lookSide === 'dark' ? 'light' : 'dark'} mode Core's own colors mix in. Pin it with <Theme mode="${lookSide}">`,
    });
  }
  // Text on an image the app paints its page with is not measured: said,
  // never passed as clean.
  const image = app?.themed
    ? app.pageImage.find(x => isPattern(x.value, res.light))
    : null;
  if (image)
    out.push({
      kind: 'page-image',
      mode: 'both',
      message: `${image.file} paints the page with an image (${image.value.slice(0, 60)}); text on it is not measured: give text on it a plain fill, or check it by eye`,
    });
  if (app?.themed && own.has(PAGE) && !app.painted)
    out.push({
      kind: 'page',
      mode: 'both',
      token: PAGE,
      message: `the app's page is not painted: outside an AppShell the browser's white shows. Paint html and body with var(${PAGE})`,
    });
  return {problems: out, accepted: text.accepted};
}

/**
 * A token's value with no color reading, as written in a mode's tokens,
 * each lone `var()` followed (or a raw value's).
 * @param {Record<string, string>} res @param {string} t @param {string} [raw]
 */
function colorlessValue(res, t, raw = undefined) {
  let v = String(raw ?? res[t] ?? '');
  for (let i = 0; i < 8; i++) {
    const ref = /^var\(\s*(--[\w-]+)\s*\)$/.exec(v.trim());
    if (!ref) break;
    v = String(res[ref[1]] ?? '');
  }
  return v;
}

/**
 * The values that repair what can be repaired without a decision.
 * @typedef {object} LookRepair
 * @property {Record<string, string | [string, string]>} tokens token values to write
 * @property {Record<string, Record<string, Record<string, true>>>} components part styles to write: each member of a group inside a bar spreads the shared const that holds the theme's own text
 * @property {Record<string, Record<string, string>>} shared the consts those styles spread, by name: the theme's own text tokens
 * @property {Array<{token?: string, part?: string, group?: string, parts?: string[], value: string | [string, string], why: string, from?: string | [string, string], accept?: AcceptRecord[]}>} lines
 *   what each written value is for; a color the author set that a line
 *   moves names its old value (`from`) and the records that would keep it
 *   as designed instead (`accept`, with the reason left to write)
 * @property {Mode | null} pin the mode to pin the app to
 * @property {boolean} paint whether to paint the app's page
 */

/**
 * The colors the theme leaves unset, filled from the ones it sets: the
 * palette generator grows a family from each color the theme sets (its
 * surface or page, its accent, its status colors) and maps them to every
 * color token as the official themes do. Each mode takes the side of the
 * palette its page is on.
 * @param {Look} look
 * @returns {Record<string, Partial<Record<Mode, string>>>}
 */
function filledColors(look) {
  const {res, own, modes, base, defaults} = look;
  const page = (/** @type {Mode} */ m) =>
    shown(colorIn(`var(${PAGE})`, res[m], m), null);
  /** @type {Record<Mode, Mode>} */
  const side = {light: 'light', dark: 'dark'};
  for (const m of modes) {
    const p = page(m);
    if (p) side[m] = sideOf(p);
  }
  /** The mode a side of the palette stands for. @param {Mode} s */
  const modeOf = s => modes.find(m => side[m] === s) ?? s;
  /** A token the theme sets, as a seed. @param {string} t */
  const seedOf = t => {
    if (!own.has(t)) return null;
    const m = modeOf('light');
    const c = parseColor(colorIn(`var(${t})`, res[m], m));
    return c ? hex(c) : null;
  };
  /** @type {Array<{id: string, seed: string}>} */
  const dials = [];
  const neutral = seedOf(SURFACE) ?? seedOf(PAGE);
  if (neutral) dials.push({id: 'neutral', seed: neutral});
  const accent = seedOf('--color-accent');
  if (accent) dials.push({id: 'accent', seed: accent});
  for (const [dial, word] of Object.entries(STATUS_TOKEN)) {
    const seed = seedOf(`--color-${word}`);
    if (seed) dials.push({id: dial, seed});
  }
  if (!dials.length) return {};
  /** @type {import('../theme/palette/generate/mapping.mjs').PaletteMappingContext} */
  const context = {
    base,
    has: t => t in defaults,
    reader: {
      rgb: v => /** @type {Rgb | null} */ (parseColor(v)),
      alpha: v => alphaOf(v),
    },
    settingOf: (t, s) => (own.has(t) ? res[modeOf(s)][t] : undefined),
    colorIn: (v, s) => colorIn(v, res[modeOf(s)], modeOf(s)),
    setExactly: t => own.has(t),
  };
  const plan = planPaletteRequest(dials, {recipe: PALETTE_RECIPE_V2}, context);
  if (!plan) return {};
  const candidate = generateTonalPalette(/** @type {any} */ (plan.config));
  const mapping = mapPalette(candidate, dials, plan.fills, context);
  /** A chart color the theme copied from Core's. @param {string} t */
  const copied = t =>
    own.has(t) && t.startsWith('--color-data-') && coreCopy(look, t);
  // The category and chart colors, by the editor's own rules (Core's
  // context.editor): their hues grow with the look beside the theme's own
  // colors (grownFamilies), and the palette derives each one from them.
  const config = /** @type {any} */ (plan.config);
  const grown = editorLook
    .grownFamilies(dials, {base, reader: context.reader})
    .filter(
      f => !config.families.some((/** @type {any} */ x) => x?.id === f.id),
    );
  const looks = mapPalette(
    generateTonalPalette({...config, families: [...config.families, ...grown]}),
    dials,
    plan.fills,
    {
      ...context,
      editor: editorLook,
      defaults,
      setExactly: t => own.has(t) && !copied(t),
    },
  ).tokens;
  /** @type {Record<string, Partial<Record<Mode, string>>>} */
  const out = {};
  /** @typedef {(typeof mapping.tokens)[string]} TokenRefs */
  /** @type {Array<[string, TokenRefs, boolean]>} */
  const entries = [
    ...Object.entries(mapping.tokens).map(
      ([t, v]) => /** @type {[string, TokenRefs, boolean]} */ ([t, v, false]),
    ),
    ...Object.entries(looks)
      .filter(([t]) => CATEGORY_OR_CHART.test(t))
      // (A chart color the theme copied from Core's is Core's: it follows
      // the theme too.)
      .map(
        ([t, v]) =>
          /** @type {[string, TokenRefs, boolean]} */ ([t, v, copied(t)]),
      ),
  ];
  for (const [t, refs, refill] of entries) {
    if (own.has(t) && !refill) continue;
    for (const m of modes) {
      const color = refs[side[m]]?.color;
      if (color) (out[t] ??= {})[m] = color;
    }
  }
  // A category or chart color the palette could not derive, in a mode
  // whose page is on the other side (a dark look shown in light): Core's
  // own color for the side the page is on.
  for (const t of Object.keys(defaults)) {
    if (!CATEGORY_OR_CHART.test(t) || own.has(t) || out[t]) continue;
    for (const m of modes) {
      if (side[m] === m) continue;
      const color = colorIn(`var(${t})`, base[side[m]], side[m]);
      if (color) (out[t] ??= {})[m] = color;
    }
  }
  return out;
}

/**
 * The repair for a theme's problems: unset colors filled, the theme's own
 * unreadable text moved in lightness just far enough to read, parts
 * inside a bar given the theme's own text again, a flat menu given Core's
 * overlay shadow, a one-look theme's mode pinned, the page painted. It
 * changes no color the theme sets but its own text and icon colors.
 * @param {Look} look
 * @param {LookProblem[]} problems
 * @returns {LookRepair}
 */
export function lookRepair(look, problems) {
  const {own, modes} = look;
  /** @type {Record<string, Partial<Record<Mode, string>>>} */
  const perMode = {};
  /** @type {Record<string, string>} */
  const why = {};
  const fills = filledColors(look);
  const filledHad = new Set(Object.keys(fills));
  // A chart color the theme copied from Core's is derived again only when
  // the check says the charts keep Core's colors.
  const charts = problems.some(p => p.kind === 'charts');
  for (const [t, v] of Object.entries(fills)) {
    if (own.has(t) && !charts) continue;
    perMode[t] = v;
    why[t] = own.has(t)
      ? "Core's chart color, copied: derived from the colors the theme sets"
      : 'unset: filled from the colors the theme sets';
  }
  // Measured again with the filled colors, so each move is made on the
  // grounds the theme will have.
  /** @type {Record<Mode, Record<string, string>>} */
  const res = {light: {...look.res.light}, dark: {...look.res.dark}};
  for (const [t, mv] of Object.entries(perMode))
    for (const m of modes) if (mv[m]) res[m][t] = /** @type {string} */ (mv[m]);
  // An inverted surface the theme leaves unset (a toast's, an error
  // toast's) is written in both modes like every other unset color. Core
  // draws the theme's own text on it where that reads at 3:1, else the
  // on-color that reads better; where what Core draws there does not read,
  // its lightness moves to the nearest where it does.
  for (const t of INVERTED_SURFACES) {
    if (own.has(t)) continue;
    let moved = false;
    for (const m of modes) {
      const c = shown(colorIn(`var(${t})`, res[m], m), null);
      if (!c) continue;
      const read = (/** @type {string} */ x) =>
        shown(colorIn(`var(${x})`, res[m], m), c);
      const text = read('--color-text-primary');
      const sides = [read('--color-on-dark'), read('--color-on-light')].filter(
        x => x != null,
      );
      /** What Core draws on a fill reads at 4.5:1. @param {Rgb} f */
      const reads = f =>
        !sides.length ||
        (text && ratio(text, f) >= 3
          ? ratio(text, f)
          : Math.max(...sides.map(x => ratio(x, f)))) >= TEXT;
      const to = reads(c) ? c : (nearestLightness(c, reads) ?? c);
      if (to !== c) moved = true;
      const mv = (perMode[t] ??= {});
      // (A color the fill made keeps its own spelling when it reads.)
      mv[m] = res[m][t] = to === c && mv[m] ? mv[m] : hex(to);
    }
    if (moved)
      why[t] =
        `${filledHad.has(t) ? 'unset: filled from the colors the theme sets, ' : 'unset: '}as light or dark as the text Core draws on it needs to read`;
    else why[t] ??= "unset: filled with Core's own color, which reads";
  }
  // Core derives some tokens from others (the status roles from the
  // category colors): resolved again with the filled colors, so each one
  // is measured as the theme will draw it.
  if (look.resolveWith) {
    /** @type {Record<string, [string, string]>} */
    const extra = {};
    for (const [t, mv] of Object.entries(perMode))
      extra[t] = [
        String(mv.light ?? res.light[t] ?? ''),
        String(mv.dark ?? res.dark[t] ?? ''),
      ];
    const again = look.resolveWith(extra);
    for (const m of /** @type {Mode[]} */ (['light', 'dark'])) {
      res[m] = {...again[m]};
      for (const [t, mv] of Object.entries(perMode))
        if (mv[m]) res[m][t] = /** @type {string} */ (mv[m]);
    }
  }
  const filled = new Set(Object.keys(perMode));
  /** @type {Record<string, Array<Omit<AcceptRecord, 'reason'>>>} */
  const keep = {};
  const now = lookProblems({...look, res}).problems;
  // Text the theme sets, and edges the fill set, that do not read: the
  // grounds each fails on, by token and mode, and the nearest color that
  // reads on all of them. Only grounds on the page's side count: text on
  // a ground of the other side is drawn by another token.
  /** @type {Map<string, {token: string, mode: Mode, needs: number}>} */
  const nudge = new Map();
  for (const p of now)
    if (
      p.token &&
      p.mode !== 'both' &&
      // (Text the theme leaves unset moves too: Core's own value that does
      // not read on the theme's colors is written as the one that does.)
      ((p.kind === 'text' && DRAWN_AS_TEXT.test(p.token)) ||
        (p.kind === 'edge' && !own.has(p.token)))
    )
      nudge.set(`${p.token}|${p.mode}`, {
        token: p.token,
        mode: p.mode,
        needs: Math.max(
          p.needs ?? TEXT,
          ...now
            .filter(q => q.token === p.token && q.mode === p.mode)
            .map(q => q.needs ?? TEXT),
        ),
      });
  for (const {token, mode, needs} of nudge.values()) {
    const page = shown(colorIn(`var(${PAGE})`, res[mode], mode), null);
    const fg = shown(colorIn(`var(${token})`, res[mode], mode), page);
    if (!fg || !page) continue;
    const all = now
      .filter(p => p.token === token && p.mode === mode && p.on)
      .map(p => shown(colorIn(`var(${p.on})`, res[mode], mode), page))
      .filter(/** @returns {g is Rgb} */ g => g != null);
    // Text on a fill (--color-on-*) sides with its first fill; other text
    // with the page.
    const side = sideOf(/^--color-on-/.test(token) ? (all[0] ?? page) : page);
    const grounds = all.filter(g => sideOf(g) === side);
    if (!grounds.length) continue;
    if (token === EDGE) {
      // An edge moves until it shows on every surface it sits on, each by
      // its own share of Core's edge there, not only the ones it failed.
      const each = GROUNDS.map(g => ({
        c: shown(colorIn(`var(${g})`, res[mode], mode), page),
        needs: edgeNeeds(look, g, mode),
      })).filter(x => x.c != null && x.needs != null);
      const moved = nearestLightness(fg, f =>
        each.every(
          x =>
            ratio(f, /** @type {Rgb} */ (x.c)) + 0.005 >=
            /** @type {number} */ (x.needs),
        ),
      );
      if (moved) (perMode[token] ??= {})[mode] = hex(moved);
    } else
      (perMode[token] ??= {})[mode] = nearestReadingLightness(
        fg,
        grounds,
        needs,
      );
    why[token] = own.has(token)
      ? 'did not read on every surface it sits on'
      : filled.has(token)
        ? 'unset: filled, then moved until it shows on every surface'
        : "unset: Core's own did not read on the theme's colors, moved until it shows";
    // A color the author set is moved in the open: the line names the
    // record that keeps it as designed instead.
    if (own.has(token))
      for (const p of now)
        if (p.token === token && p.mode === mode && p.kind === 'text')
          (keep[token] ??= []).push(...(ACCEPT.get(p) ?? []));
  }
  // A chart color the theme leaves unset (or the fill made) that barely
  // shows on the card or the page: its lightness moves to the nearest
  // where it shows on both.
  for (const p of now) {
    if (p.kind !== 'chart-ground' || p.mode === 'both') continue;
    const mode = p.mode;
    const page = shown(colorIn(`var(${PAGE})`, res[mode], mode), null);
    const grounds = [CARD, PAGE]
      .map(g => ({g, c: shown(colorIn(`var(${g})`, res[mode], mode), page)}))
      .filter(x => x.c != null);
    for (const t of p.parts ?? []) {
      // (A chart color the theme copied from Core's is Core's: it moves.)
      if (own.has(t) && !coreCopy(look, t)) continue;
      const c = shown(colorIn(`var(${t})`, res[mode], mode), page);
      if (!c) continue;
      const moved = nearestLightness(c, f =>
        grounds.every(({g, c: ground}) => {
          const needs = chartFloor(look, t, g, mode);
          return (
            needs == null || ratio(f, /** @type {Rgb} */ (ground)) >= needs
          );
        }),
      );
      if (!moved) continue;
      (perMode[t] ??= {})[mode] = res[mode][t] = hex(moved);
      why[t] =
        `${filled.has(t) ? 'unset: filled, then' : "unset: Core's own"} moved until it shows on the card and the page`;
    }
  }
  /** @type {Record<string, string | [string, string]>} */
  const tokens = {};
  /** @type {LookRepair['lines']} */
  const lines = [];
  for (const [t, mv] of Object.entries(perMode)) {
    const at = (/** @type {Mode} */ m) =>
      mv[m] ?? colorIn(`var(${t})`, res[m], m) ?? undefined;
    // Both halves are written: a mode the app does not show keeps its own
    // value.
    const light = at('light');
    const dark = at('dark');
    if (!light || !dark) continue;
    /** @type {string | [string, string]} */
    const value = light === dark ? light : [light, dark];
    tokens[t] = value;
    const was = (/** @type {Mode} */ m) => colorIn(`var(${t})`, look.res[m], m);
    const from =
      was('light') === was('dark') ? was('light') : [was('light'), was('dark')];
    lines.push({
      token: t,
      value,
      why: why[t],
      ...(keep[t]
        ? {
            from: /** @type {string | [string, string]} */ (from),
            accept: keep[t].map(r => ({...r, reason: ''})),
          }
        : own.has(t)
          ? {from: /** @type {string | [string, string]} */ (from)}
          : {}),
    });
  }
  const {defaults} = look;
  for (const p of problems) {
    if (p.kind !== 'font' || !p.token) continue;
    const generic = coreGeneric(look, p.token);
    if (!generic) continue;
    tokens[p.token] = `${String(look.res.light[p.token]).trim()}, ${generic}`;
    lines.push({
      token: p.token,
      value: tokens[p.token],
      why: `named a font nothing loads with no generic after it: ${generic}, as in Core's own stack`,
    });
  }
  for (const p of problems)
    if (p.kind === 'blend' && p.mode !== 'both')
      for (const t of flatMenus(look, p.mode, () => true).tokens)
        if (defaults[t] && !tokens[t]) {
          tokens[t] = String(defaults[t]);
          lines.push({
            token: t,
            value: tokens[t],
            why: "menus blended into the page: Core's own overlay shadow",
          });
        }
  // The parts inside a bar take the theme's own text again: the style
  // block whose text failed spreads one shared const, so the person has
  // one line to change; the lines are told by group.
  /** @type {LookRepair['components']} */
  const components = {};
  /** @type {LookRepair['shared']} */
  const shared = {};
  for (const p of now) {
    // (A fill the bar sets for its own parts goes back to the theme's on
    // the parts inside it that draw their text on it, the same way.)
    if ((p.kind !== 'bar-text' && p.kind !== 'bar-fill') || !p.token || !p.part)
      continue;
    if (!BAR_BLOCKS.get(p)?.size) continue;
    const l = colorIn(`var(${p.token})`, res.light, 'light');
    const d = colorIn(`var(${p.token})`, res.dark, 'dark');
    const value = l && d && l !== d ? `light-dark(${l}, ${d})` : (l ?? d);
    if (!value) continue;
    const name = `${p.part.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())}InsideText`;
    (shared[name] ??= {})[p.token] = value;
    // The pointer tints the bar sets for what it holds reach the same
    // parts: a menu row's hover would show the bar's tint on the menu's
    // own fill. They take the theme's own tints from the same const.
    for (const tint of BAR_TINTS) {
      if (
        partValue(look.components, p.part, [tint], 'light') == null &&
        partValue(look.components, p.part, [tint], 'dark') == null
      )
        continue;
      const tl = colorIn(`var(${tint})`, res.light, 'light');
      const td = colorIn(`var(${tint})`, res.dark, 'dark');
      const own =
        tl && td && tl !== td ? `light-dark(${tl}, ${td})` : (tl ?? td);
      if (own) shared[name][tint] = own;
    }
    // Only the style block whose text failed (a variant, else the plain
    // block) takes the text: the part elsewhere, and its other variants,
    // keep the bar's text.
    /** @type {Map<string, string[]>} */
    const groups = new Map();
    for (const at of BAR_BLOCKS.get(p) ?? []) {
      const [q, block] = at.split('|');
      ((components[q] ??= {})[block] ??= {})[`...${name}`] = true;
      const group = familyOf(q) ?? q;
      groups.set(group, [
        ...(groups.get(group) ?? []),
        block === 'base' ? q : `${q} (${block})`,
      ]);
    }
    // What the bar sets that the parts inside it take back: its text, or
    // a fill or pointer tint it sets for what it holds.
    const part = p.part;
    const barValue = (/** @type {string} */ t) => {
      const bl = partValue(look.components, part, [t], 'light');
      const bd = partValue(look.components, part, [t], 'dark');
      return bl != null && bd != null && bl !== bd
        ? `light-dark(${bl}, ${bd})`
        : (bl ?? bd ?? undefined);
    };
    for (const [group, members] of groups)
      for (const [t, v] of Object.entries(shared[name]))
        if (!lines.some(x => x.group === group && x.token === t)) {
          const from = barValue(t);
          lines.push({
            group,
            parts: members,
            token: t,
            value: /** @type {string} */ (v),
            why: TEXT_TOKEN.test(t)
              ? `inside ${p.part}: the theme's own text on their own fill, from ${name}`
              : `inside ${p.part}: the theme's own ${t} on them, not the one ${p.part} sets for its own parts, from ${name}`,
            ...(from ? {from} : {}),
          });
        }
  }
  const one = problems.find(p => p.kind === 'one-look');
  const darkPage = shown(colorIn(`var(${PAGE})`, res.dark, 'dark'), null);
  return {
    tokens,
    components,
    shared,
    lines,
    pin: one && darkPage ? sideOf(darkPage) : null,
    paint: problems.some(p => p.kind === 'page'),
  };
}
