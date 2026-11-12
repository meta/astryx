// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The type checker behind `astryx experimental theme`: the type of
 * every token (from Core's own token groups), what each part reads (from the
 * part data), and the checks that refuse a change that cannot take effect.
 * Also `how` lookups, and contrast problems the theme caused versus its base.
 *
 * @position api/theme-edit — compile-time knowledge over the part data
 */

import {DIRECT, GROUPS, HOW} from './_tables.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';

/** Only these token types may differ between light and dark. */
export const MODAL = new Set(['color', 'shadow']);

/**
 * Whether a token is a color by its name, as Core's color groups and the
 * token table type it: `--color-*`, `--syntax-*` and `--focus-outline-color`.
 * Settings are checked by it where no installed Core is read.
 * @param {string} name
 */
export const isColorToken = name =>
  /^--color-|^--syntax-|^--focus-outline-color$/.test(name);

/** Tokens a component may read only in some states: never refused globally. */
/**
 * Tokens no catalog part is recorded reading, though Core reads them: code
 * highlighting, the display text sizes and the colored icons read them only
 * under a variant or in a global stylesheet. Never refused as unread.
 */
const SOFT =
  /^--(color-data|color-syntax|syntax|duration|ease|z-|layer|breakpoint|text-display-\d|color-icon-[a-z]+$)/;

/** @typedef {{token: string, props: string[], when: string[]}} Read */
/** @typedef {{message: string, run: string[], also: string[], soft?: boolean}} CheckFailure */
/** @typedef {import('./_parts.mjs').PartData} PartData */
/** @typedef {import('./_parts.mjs').TextPair} TextPair */

/**
 * @param {import('./_project.mjs').ThemeProject} project
 * @param {PartData} parts
 */
export function makeCompiler(project, parts) {
  const {core} = project;
  const MAP = parts.map;
  const TARGET = project.target;

  /** @type {Record<string, string>} */
  const TYPE = {};
  /** @param {unknown} obj */
  const groupVars = obj =>
    Object.values(/** @type {Record<string, unknown>} */ (obj ?? {}))
      .map(v => /var\((--[a-zA-Z0-9-]+)/.exec(String(v))?.[1])
      .filter(/** @returns {v is string} */ v => Boolean(v));
  /** @param {string[]} list @param {string} type */
  const put = (list, type) => {
    for (const k of list) TYPE[k] ??= type;
  };
  put(groupVars(core.colorVars), 'color');
  put(groupVars(core.shadowVars), 'shadow');
  put(groupVars(core.radiusVars), 'size');
  put(groupVars(core.spacingVars), 'size');
  put(groupVars(core.sizeVars), 'size');
  put(groupVars(core.textSizeVars), 'size');
  put(groupVars(core.borderVars), 'size');
  put(groupVars(core.fontWeightVars), 'number');
  put(groupVars(core.durationVars), 'time');
  put(groupVars(core.easeVars), 'easing');
  for (const k of Object.keys(core.tokenDefaults ?? {})) {
    if (TYPE[k]) continue;
    if (isColorToken(k)) TYPE[k] = 'color';
    else if (/^--font-family/.test(k)) TYPE[k] = 'font';
    else if (/^--font-weight|^--text-.*-weight$/.test(k)) TYPE[k] = 'number';
    else if (/^--shadow/.test(k)) TYPE[k] = 'shadow';
    else if (
      /^--(radius|spacing|size|text-.*-size|border-width|focus-outline-(width|offset))/.test(
        k,
      )
    )
      TYPE[k] = 'size';
    else if (/leading|line-height/.test(k)) TYPE[k] = 'number';
    else TYPE[k] = 'other';
  }
  /** @param {string} tok */
  const typeOf = tok => TYPE[tok] ?? 'other';

  /** @param {string} p */
  const groupOfProp = p =>
    Object.entries(GROUPS).find(([, ps]) => ps.includes(p))?.[0] ?? null;

  /** @param {string} t @returns {string | null} */
  function groupOfToken(t) {
    if (/^--color-(text|on|icon)-/.test(t) || t === '--color-on-accent')
      return 'text';
    if (/^--color-border/.test(t)) return 'border';
    if (/^--color-shadow$|^--shadow-/.test(t)) return 'shadow';
    if (/^--color-/.test(t)) return 'background';
    if (/^--radius-/.test(t)) return 'corners';
    if (/^--spacing-/.test(t)) return 'spacing';
    if (/^--(font|text)-/.test(t)) return 'font';
    if (/^--size-/.test(t)) return 'size';
    if (/^--border-width/.test(t)) return 'border';
    return null;
  }

  /** A condition, kept to what a person can act on. @param {string} target @param {string} cond */
  function shortCond(target, cond) {
    if (cond === 'always') return '';
    const attrs = MAP[target]?.attrs ?? {};
    const [attrPart, ...css] = cond.split(' ');
    const kept = (attrPart.includes('=') ? attrPart.split(',') : []).filter(
      kv => {
        const [k] = kv.split('=');
        return (
          k === 'selected' ||
          (['variant', 'status', 'tone', 'color'].includes(k) &&
            (attrs[k]?.length ?? 0) > 1)
        );
      },
    );
    const cssPart = (attrPart.includes('=') ? css : [attrPart, ...css])
      .join(' ')
      .replace(/\[data-astryx-press="[a-z]+"\]/g, ':active')
      .trim();
    return [...kept, cssPart].filter(Boolean).join(' ');
  }

  /**
   * The tokens a part reads for one aspect (or every aspect), each with the
   * properties and conditions it applies under; unconditional reads first.
   * @param {string} target
   * @param {string | null} group
   * @returns {Read[]}
   */
  function partReads(target, group) {
    const own = MAP[target]?.own ?? {};
    /** @type {Map<string, {token: string, props: Set<string>, when: Set<string>}>} */
    const out = new Map();
    for (const [prop, v] of Object.entries(own)) {
      if (group && groupOfProp(prop) !== group) continue;
      for (const [tok, conds] of Object.entries(v.tokens)) {
        const e = out.get(tok) ?? {
          token: tok,
          props: new Set(),
          when: new Set(),
        };
        e.props.add(prop);
        for (const c of conds) e.when.add(shortCond(target, c));
        out.set(tok, e);
      }
    }
    return [...out.values()]
      .map(e => ({token: e.token, props: [...e.props], when: [...e.when]}))
      .sort(
        (a, b) => (b.when.includes('') ? 1 : 0) - (a.when.includes('') ? 1 : 0),
      );
  }

  const STATUS = /-(info|success|warning|error)(-|$)/;
  /** @param {string} target @param {string} tok */
  const statusNote = (target, tok) =>
    STATUS.test(tok) && (TARGET.get(target)?.props ?? []).includes('status')
      ? ` [status ${tok.match(STATUS)?.[1]}; other statuses: same name with success|warning|error]`
      : '';
  /** @param {string[]} w */
  const fmtWhen = w =>
    w.includes('') || !w.length
      ? ''
      : ` (when ${w.filter(Boolean).slice(0, 3).join(' | ')}${w.length > 3 ? ' | ...' : ''})`;

  /** Every token the part or anything inside it reads. @param {string} target */
  function allReads(target) {
    /** @type {Set<string>} */
    const s = new Set();
    /** @param {string} t */
    const add = t => {
      for (const v of Object.values(MAP[t]?.own ?? {}))
        for (const k of Object.keys(v.tokens)) s.add(k);
      for (const k of Object.keys(MAP[t]?.inside ?? {})) s.add(k);
    };
    add(target);
    for (const c of MAP[target]?.contains ?? []) add(c);
    return s;
  }
  /** @type {Map<string, string[]>} */
  const readersCache = new Map();
  /** The parts that read a token anywhere. @param {string} tok */
  const anyReader = tok => {
    let r = readersCache.get(tok);
    if (!r) {
      r = Object.keys(MAP).filter(
        t =>
          Object.values(MAP[t].own).some(v => tok in v.tokens) ||
          tok in (MAP[t].inside ?? {}),
      );
      readersCache.set(tok, r);
    }
    return r;
  };

  /**
   * Where a token feeds a part: each property of the part (or of an element
   * or part inside it) that reads it, with its condition.
   * @param {string} target
   * @param {string} token
   * @returns {Array<{part: string, prop: string, when: string}>}
   */
  function feeds(target, token) {
    /** @type {Array<{part: string, prop: string, when: string}>} */
    const out = [];
    for (const t of [target, ...(MAP[target]?.contains ?? [])]) {
      for (const [prop, v] of Object.entries(MAP[t]?.own ?? {})) {
        for (const c of v.tokens[token] ?? [])
          out.push({part: t, prop, when: shortCond(t, c)});
      }
      for (const prop of MAP[t]?.inside?.[token] ?? [])
        out.push({part: t, prop, when: ''});
    }
    return out;
  }

  /**
   * One line for where a token feeds. A part inside `target` (a button in a
   * toast) is named as inside it, so the line never reads as every button.
   * @param {ReturnType<typeof feeds>} list
   * @param {string} [target]
   */
  const fmtFeeds = (list, target) =>
    [
      ...new Set(
        list.map(
          f =>
            `${f.prop}${f.part ? ` on ${f.part}${target && f.part !== target ? ` inside ${target}` : ''}` : ''}${f.when ? ` (when ${f.when})` : ''}`,
        ),
      ),
    ]
      .slice(0, 4)
      .join(', ');

  /**
   * Whether a token set on a part can take effect there: the part, or a part
   * inside it, must read it. A part with no record is checked through the
   * parts that contain it, else reported unchecked (soft).
   * @param {string} theme
   * @param {string} target
   * @param {string} token
   * @param {string} value
   * @param {string} P
   * @returns {CheckFailure | null}
   */
  function checkTokenOn(theme, target, token, value, P) {
    if (!MAP[target]) {
      return {
        soft: true,
        message: `There is no compiled record of what ${target} reads (it did not render in the catalog), so this change could not be checked.`,
        run: [],
        also: [],
      };
    }
    const g = groupOfToken(token);
    if (allReads(target).has(token)) {
      // Read, but maybe only for another property: an error color that feeds
      // only the focus outline does not paint the background.
      const fed = feeds(target, token);
      const wanted =
        g === 'text'
          ? ['color', 'fill']
          : g === 'background'
            ? ['background-color', 'background', 'background-image']
            : null;
      // The part reads the token the user named: it is set as asked, and
      // the result names what it feeds.
      void wanted;
      void fed;
      return null;
    }
    const reads = g ? partReads(target, g) : [];
    const v = quoteCommandArgument(value);
    /** @type {string[]} */
    const run = [];
    if (reads.length)
      run.push(
        ...reads
          .slice(0, 3)
          .map(
            r =>
              `${P} set ${theme} ${r.token} ${v} --on ${target}${fmtWhen(r.when) ? `   #${fmtWhen(r.when)}` : ''}`,
          ),
      );
    // The property that takes this kind of value: a size goes to
    // font-size, never to font-weight.
    const direct =
      g === 'font'
        ? /-(size)$|font-size-/.test(token)
          ? 'font-size'
          : /-leading$/.test(token)
            ? 'line-height'
            : /-tracking$/.test(token)
              ? 'letter-spacing'
              : /family/.test(token)
                ? 'font-family'
                : 'font-weight'
        : g && DIRECT[g];
    if (direct)
      run.push(
        `${P} set ${theme} ${direct} ${v} --on ${target}   # sets it directly, whatever token it uses`,
      );
    const kids = g
      ? (MAP[target]?.contains ?? [])
          .filter(c => partReads(c, g).length)
          .slice(0, 4)
      : [];
    const what = g
      ? `${target}'s ${g} comes from ${
          reads.length
            ? reads
                .slice(0, 4)
                .map(
                  r => r.token + fmtWhen(r.when) + statusNote(target, r.token),
                )
                .join(', ')
            : 'no token, so set the property directly'
        }`
      : `${target} reads: ${[...allReads(target)].slice(0, 8).join(', ')}`;
    return {
      message: `${target} never reads ${token}. ${what}.`,
      run,
      also: kids.length
        ? [
            `parts inside ${target} with their own ${g}: ${kids.join(', ')} (${HOW} ${kids[0]})`,
          ]
        : [],
    };
  }

  /**
   * Whether a whole-theme token is read by any part.
   * @param {string} token
   * @param {string} _P the command prefix (unused: the result is a note)
   * @returns {CheckFailure | null}
   */
  function checkTokenGlobal(token, _P) {
    if (anyReader(token).length || SOFT.test(token)) return null;
    const g = groupOfToken(token);
    const near = g
      ? Object.keys(MAP)
          .flatMap(t => partReads(t, g).map(r => r.token))
          .filter((x, i, a) => a.indexOf(x) === i && groupOfToken(x) === g)
          .slice(0, 6)
      : [];
    return {
      message: `No component reads ${token}, so setting it changes nothing.${near.length ? ` Tokens components do read for ${g}: ${near.join(', ')}.` : ''}`,
      run: [`${HOW} ${quoteCommandArgument(token)}`],
      also: [],
    };
  }

  /**
   * Each visual prop of a part and its values: from the component doc, else
   * the values seen in the catalog.
   * @param {string} target
   * @returns {Record<string, string[]>}
   */
  function variantValues(target) {
    const comp = TARGET.get(target)?.component;
    const info = comp ? project.components[comp] : undefined;
    const t =
      info?.targets.find(x => x.className === `astryx-${target}`) ??
      info?.targets[0];
    const fromDocs = t?.values ?? {};
    const seen = MAP[target]?.attrs ?? {};
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const p of TARGET.get(target)?.props ?? [])
      out[p] = fromDocs[p]?.length ? fromDocs[p] : (seen[p] ?? []);
    return out;
  }

  /**
   * Text that this theme made unreadable: every real text-on-background pair,
   * in each mode, below 4.5:1 now but not as low in the base theme. Also
   * the values this theme set that have no fixed color to check (a
   * `color-mix()`, a `var()`), so the result can say what it skipped.
   * @param {(pair: TextPair, side: 'fg' | 'bg', mode: string) => string | null | undefined} value
   * @param {(pair: TextPair, side: 'fg' | 'bg', mode: string) => string | null | undefined} baseValue
   * @param {string[]} modes
   * @param {{parseColor: (v: unknown) => [number, number, number] | null, ratio: (a: number[], b: number[]) => number, alphaOf: (v: unknown) => number, compositeOver: (over: [number, number, number], alpha: number, under: [number, number, number]) => [number, number, number], page: (mode: string) => string | null | undefined}} helpers
   *   `page` is the page color in a mode: a see-through background is drawn
   *   over it, and see-through text over that background, before measuring.
   * @param {TextPair[]} [extra] more pairs to measure (a part's variants)
   */
  function contrast(
    value,
    baseValue,
    modes,
    {parseColor, ratio, alphaOf, compositeOver, page},
    extra = [],
  ) {
    /**
     * The opaque colors the eye sees for a pair, or null with no fixed color.
     * @param {unknown} fg @param {unknown} bg @param {string} m
     */
    const drawn = (fg, bg, m) => {
      /** @type {[number, number, number]} */
      const ground =
        parseColor(page(m)) ?? (m === 'dark' ? [0, 0, 0] : [255, 255, 255]);
      const bgAlpha = alphaOf(bg);
      const back = parseColor(bg);
      const under =
        bgAlpha === 0 ? ground : back && compositeOver(back, bgAlpha, ground);
      const top = parseColor(fg);
      if (!under || !top) return null;
      return [compositeOver(top, alphaOf(fg), under), under];
    };
    /** @type {Array<{part: string, mode: string, ratio: number, sample: string, fg: string, bgPart: string | null, bg: string}>} */
    const out = [];
    const seen = new Set();
    /** @type {Set<string>} */
    const unchecked = new Set();
    for (const p of [...parts.pairs, ...extra]) {
      if (
        p.fg.target !== p.bg.target &&
        p.bg.target &&
        partReads(p.bg.target, 'text').length
      )
        continue;
      for (const m of modes) {
        const fg = value(p, 'fg', m);
        const bg = value(p, 'bg', m);
        if (/gradient|url\(/.test(String(bg))) continue;
        const pair = drawn(fg, bg, m);
        if (!pair) {
          for (const [v, side] of /** @type {const} */ ([
            [fg, 'fg'],
            [bg, 'bg'],
          ]))
            if (
              v &&
              !parseColor(v) &&
              alphaOf(v) !== 0 &&
              v !== baseValue(p, side, m)
            )
              unchecked.add(String(v));
          continue;
        }
        const r = ratio(pair[0], pair[1]);
        if (r >= 4.5) continue;
        const was = drawn(baseValue(p, 'fg', m), baseValue(p, 'bg', m), m);
        if (was && ratio(was[0], was[1]) <= r + 0.05) continue;
        const key = `${p.text}|${fg}|${bg}|${m}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          part: p.text,
          mode: m,
          ratio: Number(r.toFixed(2)),
          sample: p.sample,
          // A side the theme changed is named by the value it set, not the
          // token the part reads without it.
          fg:
            fg !== baseValue(p, 'fg', m)
              ? String(fg)
              : (p.fg.tokens[0] ?? String(fg)),
          bgPart: p.bg.target,
          bg:
            bg !== baseValue(p, 'bg', m)
              ? String(bg)
              : (p.bg.tokens[0] ?? String(bg)),
        });
      }
    }
    return {
      problems: out.slice(0, 8),
      more: Math.max(0, out.length - 8),
      unchecked: [...unchecked],
    };
  }

  /**
   * Whether a part shows its corners: it sets a radius, a background, a
   * border or a shadow. A radius on anything else changes nothing you see.
   * @param {string} target
   */
  function showsCorners(target) {
    const own = MAP[target]?.own;
    if (!own) return true;
    for (const [p, v] of Object.entries(own)) {
      if (GROUPS.corners.includes(p) || p === 'box-shadow') return true;
      if (
        /^border(-(top|right|bottom|left|block|inline))?(-width)?$/.test(p) &&
        v.values.some(x => !/^(0|0px|none)$/.test(x))
      )
        return true;
      if (
        p === 'background-color' ||
        p === 'background' ||
        p === 'background-image'
      ) {
        // A background the same as the page behind it shows no edge.
        const always = Object.entries(v.tokens).some(
          ([tok, conds]) =>
            tok !== '--color-background-body' && conds.includes('always'),
        );
        const raw = v.values.some(
          x => !/var\(|transparent|inherit|none/.test(x),
        );
        if (always || raw) return true;
      }
    }
    return false;
  }

  return {
    MAP,
    typeOf,
    feeds,
    fmtFeeds,
    showsCorners,
    groupOfToken,
    groupOfProp,
    partReads,
    fmtWhen,
    statusNote,
    allReads,
    anyReader,
    checkTokenOn,
    checkTokenGlobal,
    variantValues,
    contrast,
  };
}

/** @typedef {ReturnType<typeof makeCompiler>} Compiler */
