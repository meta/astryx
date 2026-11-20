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
} from './_color.mjs';
import {acceptCovers} from './_accepted.mjs';
import {FAMILIES, familyOf} from './_tables.mjs';
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
 * @property {'text' | 'part-text' | 'bar-text' | 'see-through' | 'blend' | 'edge' | 'half-painted' | 'one-look' | 'page'} kind
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
 * @property {{themed: boolean, pinned: Mode | null, painted: boolean} | null} app what the app does with the theme; null outside an app
 * @property {AcceptRecord[]} accepted the contrast the theme keeps as designed
 * @property {(part: string, fill: string | null, tokens: Record<string, string>, mode: Mode) => 'off' | 'dark' | 'light' | null} mediaSide
 *   the side Core's media surface in a part draws its text in on a fill, by
 *   Core's own rule; null for a part with no media surface, `off` where it
 *   keeps the theme's own text
 */

/** The page and the grounds text and controls sit on. */
const PAGE = '--color-background-body';
const POPOVER = '--color-background-popover';
const CARD = '--color-background-card';
const SURFACE = '--color-background-surface';
const GROUNDS = [PAGE, SURFACE, CARD, POPOVER];
const EDGE = '--color-border-emphasized';
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
    for (const inner of [style[`@${m}`], style])
      if (inner && typeof inner === 'object')
        for (const k of keys) if (typeof inner[k] === 'string') return inner[k];
  }
  return null;
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
  return new Set(map[part]?.contains ?? []);
}

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
      const when = /** @type {any} */ (p).when ?? null;
      const own = partValue(
        styles,
        s.target,
        side === 'fg' ? ['color'] : ['backgroundColor', 'background'],
        mode,
        when ? String(when).replace(/^(\w+)=/, '$1:') : null,
      );
      if (own != null) return colorIn(own, tokens[mode], mode) ?? own;
      let tok = s.tokens[0];
      // Core's media surface (a toast, a lightbox) sets the text it holds
      // from --color-on-dark or --color-on-light, on the side Core picks.
      if (side === 'fg' && tok && TEXT_TOKEN.test(tok) && p.bg.target) {
        const media = look.mediaSide(
          p.bg.target,
          drawn(p, 'bg', m),
          tokens[mode],
          mode,
        );
        if (media === 'dark') tok = '--color-on-dark';
        if (media === 'light') tok = '--color-on-light';
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
    /** @type {TextPair} */
    const p = x.pair;
    const mode = /** @type {Mode} */ (x.mode);
    const when = /** @type {any} */ (p).when ?? null;
    const block = when ? String(when).replace(/^(\w+)=/, '$1:') : null;
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
    const ownBg = partValue(
      components,
      p.bg.target,
      ['backgroundColor', 'background'],
      mode,
      block,
    );
    const part =
      ownBg != null ? p.bg.target : ownFg != null ? p.fg.target : null;
    const token = ownFg == null ? (p.fg.tokens[0] ?? null) : null;
    const on = ownBg == null ? (p.bg.tokens[0] ?? null) : null;
    // A record keeps only a color the theme's author set: a color the
    // check or compile made that does not read is a fault, never a design.
    const authored = ownFg != null || (token != null && look.own.has(token));
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
 * The shadow tokens each part with the menu fill reads: what sets a menu
 * apart from what it opens over.
 * @param {Look['map']} map
 * @returns {string[][]}
 */
function overlayShadows(map) {
  /** @type {string[][]} */
  const out = [];
  for (const rec of Object.values(map)) {
    const own = rec?.own ?? {};
    const fill = Object.entries(own).some(
      ([prop, v]) => /^background/.test(prop) && POPOVER in (v.tokens ?? {}),
    );
    const shadows = Object.keys(own['box-shadow']?.tokens ?? {}).sort();
    if (fill && shadows.length) out.push(shadows);
  }
  return out;
}

/**
 * The shadow tokens of the menus that draw no shadow in a mode: every
 * shadow such a menu reads draws nothing.
 * @param {Look} look @param {Mode} m
 * @returns {string[]}
 */
function flatMenuShadows(look, m) {
  const flat = (/** @type {string} */ t) =>
    /^(none|0|0px)?$/.test(colorlessValue(look.res[m], t).trim());
  return [
    ...new Set(
      overlayShadows(look.map)
        .filter(set => set.every(flat))
        .flat(),
    ),
  ].sort();
}

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
  for (const [part, blocks] of Object.entries(components ?? {})) {
    if (!blocks || typeof blocks !== 'object') continue;
    const within = inside(map, part);
    if (!within.size) continue;
    for (const m of look.modes) {
      const page = shown(colorIn(`var(${PAGE})`, res[m], m), null);
      const style = blocks.base ?? {};
      const tokens = new Set(
        [...Object.keys(style), ...Object.keys(style[`@${m}`] ?? {})].filter(
          k => TEXT_TOKEN.test(k),
        ),
      );
      for (const token of tokens) {
        const set = partValue(components, part, [token], m);
        const fg = shown(colorIn(set, res[m], m), page);
        if (!fg) continue;
        for (const p of pairs) {
          const q = p.bg.target;
          if (!q || q === part || !within.has(q) || p.fg.tokens[0] !== token)
            continue;
          // A part that sets the token again for itself draws its own.
          if (partValue(components, q, [token], m) != null) continue;
          const fillValue =
            partValue(components, q, ['backgroundColor', 'background'], m) ??
            (p.bg.tokens[0] ? `var(${p.bg.tokens[0]})` : p.bg.raw);
          const fill = shown(colorIn(fillValue, res[m], m), page);
          if (!fill) continue;
          const r = ratio(fg, fill);
          if (r >= TEXT) continue;
          const key = `${part}|${token}|${m}`;
          const had = out.get(key);
          if (had) {
            if (!had.parts?.includes(q)) had.parts?.push(q);
            if (r < /** @type {number} */ (had.ratio)) had.ratio = fixed(r);
            continue;
          }
          out.set(key, {
            kind: 'bar-text',
            mode: m,
            message: '',
            part,
            token,
            parts: [q],
            ratio: fixed(r),
            needs: TEXT,
          });
        }
      }
    }
  }
  for (const p of out.values()) {
    const groups = [...new Set((p.parts ?? []).map(q => familyOf(q) ?? q))];
    p.message = `${p.part} sets ${p.token}, so ${(p.parts ?? []).slice(0, 3).join(', ')} inside it draw that text on their own fill: ${p.ratio}:1 in ${p.mode}. The fix sets the theme's own ${p.token} again on ${groups.join(', ')}`;
  }
  return [...out.values()];
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
  const out = [...text.problems, ...barTextProblems(look)];
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
    const flat = flatMenuShadows(look, m);
    if (
      popover &&
      flat.length &&
      [page, card].every(g => !g || oklabDistance(popover, g) < LOOKS_ALIKE)
    )
      out.push({
        kind: 'blend',
        mode: m,
        token: flat[0],
        message: `menus and dialogs blend into the page in ${m}: the same fill as the page and cards, and no shadow (${flat.join(', ')})`,
      });
    // Control edges: no fainter than Core's own edge on its own ground,
    // and 3:1 is enough.
    const edge = shown(at(EDGE), page);
    if (edge)
      for (const g of GROUNDS) {
        const ground = shown(at(g), page);
        const coreEdge = shown(colorIn(`var(${EDGE})`, base[m], m), null);
        const coreGround = shown(colorIn(`var(${g})`, base[m], m), null);
        if (!ground || !coreEdge || !coreGround) continue;
        const needs = Math.min(NON_TEXT, ratio(coreEdge, coreGround));
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
          message: `checkbox, switch and field edges barely show on ${g} in ${m}: ${fixed(r)}:1 (Core's own edge there is ${fixed(needs)}:1)`,
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
  }
  const same = [PAGE, SURFACE, '--color-text-primary'].every(
    t =>
      colorIn(`var(${t})`, res.light, 'light') ===
      colorIn(`var(${t})`, res.dark, 'dark'),
  );
  const darkPage = shown(colorIn(`var(${PAGE})`, res.dark, 'dark'), null);
  if (modes.length > 1 && same && app?.themed && !app.pinned && darkPage) {
    const lookSide = sideOf(darkPage);
    out.push({
      kind: 'one-look',
      mode: 'both',
      message: `the theme has one ${lookSide} look for both modes, but the app does not pin the mode: in ${lookSide === 'dark' ? 'light' : 'dark'} mode Core's own colors mix in. Pin it with <Theme mode="${lookSide}">`,
    });
  }
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
 * A token's value with no color reading, as written in a mode's tokens.
 * @param {Record<string, string>} res @param {string} t
 */
function colorlessValue(res, t) {
  let v = String(res[t] ?? '');
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
  /** @type {Record<string, Partial<Record<Mode, string>>>} */
  const out = {};
  for (const [t, refs] of Object.entries(mapping.tokens)) {
    if (own.has(t)) continue;
    for (const m of modes) {
      const color = refs[side[m]]?.color;
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
  for (const [t, v] of Object.entries(filledColors(look))) {
    perMode[t] = v;
    why[t] = 'unset: filled from the colors the theme sets';
  }
  // Measured again with the filled colors, so each move is made on the
  // grounds the theme will have.
  /** @type {Record<Mode, Record<string, string>>} */
  const res = {light: {...look.res.light}, dark: {...look.res.dark}};
  for (const [t, mv] of Object.entries(perMode))
    for (const m of modes) if (mv[m]) res[m][t] = /** @type {string} */ (mv[m]);
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
      ((p.kind === 'text' &&
        (own.has(p.token) || filled.has(p.token)) &&
        DRAWN_AS_TEXT.test(p.token)) ||
        (p.kind === 'edge' && filled.has(p.token)))
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
    (perMode[token] ??= {})[mode] = nearestReadingLightness(fg, grounds, needs);
    why[token] = own.has(token)
      ? 'did not read on every surface it sits on'
      : 'unset: filled, then moved until it shows on every surface';
    // A color the author set is moved in the open: the line names the
    // record that keeps it as designed instead.
    if (own.has(token))
      for (const p of now)
        if (p.token === token && p.mode === mode && p.kind === 'text')
          (keep[token] ??= []).push(...(ACCEPT.get(p) ?? []));
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
        : {}),
    });
  }
  const {defaults} = look;
  for (const p of problems)
    if (p.kind === 'blend' && p.mode !== 'both')
      for (const t of flatMenuShadows(look, p.mode))
        if (defaults[t] && !tokens[t]) {
          tokens[t] = String(defaults[t]);
          lines.push({
            token: t,
            value: tokens[t],
            why: "menus blended into the page: Core's own overlay shadow",
          });
        }
  // The parts inside a bar take the theme's own text again, a group at a
  // time: every member of the group a failing part belongs to (its own
  // part when it belongs to none) spreads one shared const, so the person
  // has one line to change.
  /** @type {LookRepair['components']} */
  const components = {};
  /** @type {LookRepair['shared']} */
  const shared = {};
  for (const p of problems) {
    if (p.kind !== 'bar-text' || !p.token || !p.part) continue;
    const l = colorIn(`var(${p.token})`, res.light, 'light');
    const d = colorIn(`var(${p.token})`, res.dark, 'dark');
    const value = l && d && l !== d ? `light-dark(${l}, ${d})` : (l ?? d);
    if (!value) continue;
    const name = `${p.part.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase())}InsideText`;
    (shared[name] ??= {})[p.token] = value;
    /** @type {Map<string, string[]>} */
    const groups = new Map();
    for (const q of p.parts ?? []) {
      const group = familyOf(q);
      groups.set(group ?? q, group ? FAMILIES[group] : [q]);
    }
    for (const [group, members] of groups) {
      for (const q of members)
        ((components[q] ??= {}).base ??= {})[`...${name}`] = true;
      if (!lines.some(x => x.group === group && x.token === p.token))
        lines.push({
          group,
          parts: members,
          token: p.token,
          value,
          why: `inside ${p.part}: the theme's own text on their own fill, from ${name}`,
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
