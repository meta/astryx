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
import {splitTop} from './_css.mjs';
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
  /** Whether Core defines the token. @param {string} tok */
  const isToken = tok => Object.hasOwn(TYPE, tok);

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

  /** @type {Map<string, boolean>} */
  const paintsMemo = new Map();
  /**
   * Whether a visual prop changes a color the part paints: two of its
   * rules that differ only in that prop's value give a color property
   * different values.
   * @param {string} target @param {string} prop
   */
  function paintsBy(target, prop) {
    const id = `${target}|${prop}`;
    const known = paintsMemo.get(id);
    if (known != null) return known;
    let found = false;
    for (const [p, rules] of Object.entries(MAP[target]?.at ?? {})) {
      if (!/(^|-)color$|^background(-color)?$|^fill$|^stroke$/.test(p))
        continue;
      /** @type {Map<string, Set<string>>} */
      const byRest = new Map();
      for (const [key, value] of Object.entries(rules)) {
        const [attrs, ...css] = key.split(' ');
        const list = attrs.includes('=') ? attrs.split(',') : [];
        if (!list.some(kv => kv.startsWith(`${prop}=`))) continue;
        const rest = [
          ...list.filter(kv => !kv.startsWith(`${prop}=`)),
          ...css,
        ].join(' ');
        const seen = byRest.get(rest) ?? new Set();
        seen.add(String(value));
        byRest.set(rest, seen);
      }
      if ([...byRest.values()].some(v => v.size > 1)) {
        found = true;
        break;
      }
    }
    paintsMemo.set(id, found);
    return found;
  }

  /** A condition, kept to what a person can act on. @param {string} target @param {string} cond */
  function shortCond(target, cond) {
    if (cond === 'always') return '';
    const attrs = MAP[target]?.attrs ?? {};
    const [attrPart, ...css] = cond.split(' ');
    const t = TARGET.get(target);
    const kept = (attrPart.includes('=') ? attrPart.split(',') : []).filter(
      kv => {
        const [k] = kv.split('=');
        // Only the part's own visual props are read down to what a person
        // acts on (a size or an elevation the render happened to use is not
        // a condition). Anything else stays: a runtime state of the part, a
        // prop of another target on the same element (a selectable card's
        // selection on its card), and the place another component puts the
        // part in (the part data's aria context conditions); none is the
        // part at rest.
        if (!t?.props.includes(k) || t.states.includes(k)) return true;
        // A look prop drawn in more than one value that changes a color
        // the part paints (a variant, a status, a toast's type) tells its
        // renders apart; one that changes only a size or a weight (a
        // heading's level) is read as the part, as a size the render used.
        return (attrs[k]?.length ?? 0) > 1 && paintsBy(target, k);
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
    // The part data never changes while the compiler lives, and the checks
    // ask for the same part many times in one command: each answer is made
    // once, and handed out frozen so no caller can change it for the next.
    const key = `${target}\0${group ?? ''}`;
    const known = readsOf.get(key);
    if (known) return known;
    const reads = freshReads(target, group);
    for (const r of reads) {
      Object.freeze(r.props);
      Object.freeze(r.when);
      Object.freeze(r);
    }
    Object.freeze(reads);
    readsOf.set(key, reads);
    return reads;
  }
  /** @type {Map<string, Read[]>} */
  const readsOf = new Map();

  /**
   * {@link partReads}, made anew.
   * @param {string} target
   * @param {string | null} group
   * @returns {Read[]}
   */
  function freshReads(target, group) {
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
   * @param {string} [when] the --when the token is set under (`variant:strong`)
   * @param {string} [also] the rest of the flags the setting carries (` --state hover --mode dark`), kept on the lines offered
   * @returns {CheckFailure | null}
   */
  function checkTokenOn(theme, target, token, value, P, when, also = '') {
    if (!MAP[target]) {
      return {
        soft: true,
        message: `There is no compiled record of what ${target} reads (it did not render in the catalog), so this change could not be checked.`,
        run: [],
        also: [],
      };
    }
    const g = groupOfToken(token);
    // Under a variant: only what the part reads in that variant's rules (or
    // rules that name no variant) counts.
    // (Several conditions, `variant:ghost+size:sm`: a rule counts when it
    // names none of them otherwise; the message names the first.)
    const whens = String(when ?? '')
      .split('+')
      .map(w => w.split(':'))
      .filter(([p, v]) => p && v);
    const [wProp, wVal] = whens[0] ?? [];
    if (wProp && wVal && allReads(target).has(token)) {
      const conds = [
        ...Object.values(MAP[target]?.own ?? {}).flatMap(
          x => /** @type {string[]} */ (x.tokens?.[token] ?? []),
        ),
      ];
      const inVariant = (/** @type {string} */ c) => {
        const attrs = c.split(' ')[0].split(',');
        return whens.every(([p, v]) => {
          const own = attrs.find(a => a.startsWith(`${p}=`));
          return !own || own === `${p}=${v}`;
        });
      };
      // (What a line inside the part declares is recorded as the part's
      // own already; any other part inside it that reads the token takes
      // it.)
      const inside =
        !MAP[target]?.line?.length &&
        (MAP[target]?.inside?.[token] ?? []).length > 0;
      if (conds.length && !conds.some(inVariant) && !inside) {
        const there = [
          ...new Set(
            Object.values(MAP[target]?.own ?? {}).flatMap(x =>
              Object.entries(x.tokens ?? {})
                .filter(([, cs]) =>
                  /** @type {string[]} */ (cs).some(inVariant),
                )
                .map(([t]) => t)
                .filter(
                  t =>
                    groupOfToken(t) === g &&
                    /^--color-/.test(t) === /^--color-/.test(token),
                ),
            ),
          ),
        ];
        return {
          message: `${target} (${wProp} ${wVal}) never reads ${token}: only its other ${wProp}s do.${there.length ? ` There it reads ${there.slice(0, 4).join(', ')}.` : ''}`,
          run: there
            .slice(0, 3)
            .map(
              t =>
                `${P} set ${theme} ${t} ${quoteCommandArgument(value)} --on ${target} --when ${when}${also}`,
            ),
          also: [],
        };
      }
    }
    // Read only under conditions the part is not drawn in by default (a
    // link reads --color-text-primary only as color primary; drawn as it
    // is, it reads --color-text-accent): set on the part with no
    // condition, it changes nothing in its default look. Said, with the
    // token that look reads and the condition that reads this one.
    if (
      !wProp &&
      allReads(target).has(token) &&
      (g === 'text' || g === 'background')
    ) {
      const conds = [
        ...Object.values(MAP[target]?.own ?? {}).flatMap(
          x => /** @type {string[]} */ (x.tokens?.[token] ?? []),
        ),
      ];
      const attrsOf = (/** @type {string} */ c) => c.split(' ')[0];
      const drawn = [
        ...new Set(
          parts.pairs
            .filter(p =>
              g === 'text' ? p.fg.target === target : p.bg.target === target,
            )
            .map(p => (g === 'text' ? p.fg.tokens[0] : p.bg.tokens[0]))
            .filter(Boolean),
        ),
      ];
      const inside = (MAP[target]?.inside?.[token] ?? []).length > 0;
      if (
        conds.length &&
        conds.every(c => /=/.test(attrsOf(c))) &&
        drawn.length &&
        !drawn.includes(token) &&
        !inside
      ) {
        const named = [
          ...new Set(
            conds
              .flatMap(c => attrsOf(c).split(','))
              .map(a => a.replace('=', ':')),
          ),
        ];
        return {
          soft: true,
          message: `${target} reads ${token} only when ${named.join(' or ')}; as drawn by default it reads ${drawn.join(', ')}, so this changes nothing in its default look. For the default look: ${P} set ${theme} ${drawn[0]} ${quoteCommandArgument(value)} --on ${target}${also}; for ${named[0]} alone: ${P} set ${theme} ${token} ${quoteCommandArgument(value)} --on ${target} --when ${named[0]}${also}`,
          run: [
            `${P} set ${theme} ${drawn[0]} ${quoteCommandArgument(value)} --on ${target}${also}`,
            `${P} set ${theme} ${token} ${quoteCommandArgument(value)} --on ${target} --when ${named[0]}${also}`,
          ],
          also: [],
        };
      }
    }
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
      // A fill token on a part Core also draws with no fill of its own
      // where it sits in another part (main content inside an app shell is
      // transparent there, and the shell's own fill shows; the census sees
      // that clear fill in no condition of the part's own): the token still
      // reaches what inside reads it, but not that part's look there. Said,
      // with the property that paints the part itself everywhere.
      const clear = ['background-color', 'background'].some(
        prop =>
          (MAP[target]?.own?.[prop]?.values ?? []).includes('transparent') &&
          !Object.values(MAP[target]?.at?.[prop] ?? {}).includes('transparent'),
      );
      if (
        g === 'background' &&
        clear &&
        fed.some(f => f.part === target && (wanted ?? []).includes(f.prop))
      )
        return {
          soft: true,
          message: `${target} is also drawn with no fill of its own inside another part (main content in an app shell is transparent, and the shell's fill shows), so there ${token} colors only what inside ${target} reads it, not ${target} itself. To paint ${target} itself everywhere: ${P} set ${theme} background-color ${quoteCommandArgument(value)} --on ${target}${when ? ` --when ${when}` : ''}${also}`,
          run: [
            `${P} set ${theme} background-color ${quoteCommandArgument(value)} --on ${target}${when ? ` --when ${when}` : ''}${also}`,
          ],
          also: [],
        };
      // The part reads the token the user named: it is set as asked, and
      // the result names what it feeds.
      return null;
    }
    // Only a token of the same kind takes the value: a weight never goes to
    // a line height, a line height never to a weight.
    // Font tokens share a type across kinds (a weight and a leading are
    // both numbers), so the kind is read from the name.
    const kindOf = (/** @type {string} */ t) =>
      /family/.test(t)
        ? 'family'
        : /weight/.test(t)
          ? 'weight'
          : /leading|line-height/.test(t)
            ? 'leading'
            : /tracking|letter-spacing/.test(t)
              ? 'tracking'
              : typeOf(t);
    const reads = g
      ? partReads(target, g).filter(r => kindOf(r.token) === kindOf(token))
      : [];
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
    // The component named like the part (Heading for heading) owns its
    // values before any other component whose docs name the same class.
    const pascal = target.replace(/(^|-)([a-z0-9])/g, (_, __, ch) =>
      ch.toUpperCase(),
    );
    const own = project.components?.[pascal]?.targets?.find(
      (/** @type {any} */ x) => x.className === `astryx-${target}`,
    );
    const t =
      own ??
      info?.targets.find(x => x.className === `astryx-${target}`) ??
      info?.targets[0];
    const fromDocs = t?.values ?? {};
    const seen = MAP[target]?.attrs ?? {};
    /** @type {Record<string, string[]>} */
    const out = {};
    for (const p of TARGET.get(target)?.props ?? [])
      out[p] = fromDocs[p]?.length ? fromDocs[p] : (seen[p] ?? []);
    // A state Core marks with more than one value (a checkbox's checked and
    // indeterminate looks) is a condition --when names by value.
    for (const st of TARGET.get(target)?.states ?? [])
      if ((seen[st] ?? []).some(v => v !== st)) out[st] = seen[st];
    return out;
  }

  /**
   * The color stops of a background made of gradients, or null when any
   * layer is an image or any stop has no color the editor can name.
   * @param {string} v
   * @returns {string[] | null}
   */
  function gradientStops(v) {
    /** The parts between commas outside parentheses. @param {string} x */
    const top = x =>
      splitTop(x, ',')
        .map(part => part.trim())
        .filter(Boolean);
    /** @type {string[]} */
    const stops = [];
    for (const layer of top(v)) {
      const m =
        /^(?:repeating-)?(?:linear|radial|conic)-gradient\((.*)\)$/s.exec(
          layer,
        );
      if (!m) {
        // A layer that is one color (the shorthand's last) is a stop too.
        if (/url\(|gradient\(/.test(layer)) return null;
        stops.push(layer);
        continue;
      }
      for (const arg of top(m[1])) {
        // The direction, shape or position comes first, with no color.
        if (
          /^(to\b|at\b|from\b|-?[\d.]+(deg|turn|rad|grad)\b|circle\b|ellipse\b|closest|farthest)/.test(
            arg,
          )
        )
          continue;
        // A stop is its color and up to two positions after it.
        const color = arg.replace(/(\s+-?[\d.]+(%|px|rem|em)?)+$/, '').trim();
        if (!color || /^-?[\d.]+(%|px|rem|em)?$/.test(color)) continue;
        stops.push(color);
      }
    }
    return stops.length ? stops : null;
  }

  /**
   * Text that this theme made unreadable: every real text-on-background pair,
   * in each mode, below 4.5:1 now but not as low in the base theme. Also
   * the values this theme set that have no fixed color to check (a
   * `color-mix()`, a `var()`), so the result can say what it skipped.
   * @param {(pair: TextPair, side: 'fg' | 'bg', mode: string) => string | null | undefined} value
   * @param {(pair: TextPair, side: 'fg' | 'bg', mode: string) => string | null | undefined} baseValue
   * @param {string[]} modes
   * @param {{parseColor: (v: unknown) => [number, number, number] | null, ratio: (a: number[], b: number[]) => number, alphaOf: (v: unknown) => number, compositeOver: (over: [number, number, number], alpha: number, under: [number, number, number]) => [number, number, number], page: (mode: string) => string | null | undefined, drawnByRule?: (pair: TextPair, side: 'fg' | 'bg', mode: string) => boolean}} helpers
   *   `page` is the page color in a mode: a see-through background is drawn
   *   over it, and see-through text over that background, before measuring.
   *   `drawnByRule`: whether the base theme's own rule for a part draws a
   *   side (not its token), so the side is named by its color.
   * @param {TextPair[]} [extra] more pairs to measure (a part's variants)
   */
  function contrast(
    value,
    baseValue,
    modes,
    {
      parseColor,
      ratio,
      alphaOf,
      compositeOver,
      page,
      drawnByRule = () => false,
    },
    extra = [],
  ) {
    /**
     * The opaque colors the eye sees for a pair, or null with no fixed color:
     * a see-through background is drawn over what is beneath it (the region
     * the part sits in, else the page).
     * @param {unknown} fg @param {unknown} bg @param {string} m
     * @param {unknown} [beneath]
     */
    const drawn = (fg, bg, m, beneath = page(m)) => {
      /** @type {[number, number, number]} */
      const ground =
        parseColor(beneath) ??
        parseColor(page(m)) ??
        (m === 'dark' ? [0, 0, 0] : [255, 255, 255]);
      const bgAlpha = alphaOf(bg);
      const back = parseColor(bg);
      const under =
        bgAlpha === 0 ? ground : back && compositeOver(back, bgAlpha, ground);
      const top = parseColor(fg);
      if (!under || !top) return null;
      return [compositeOver(top, alphaOf(fg), under), under];
    };
    /**
     * The color a one-layer linear or radial gradient has where centered
     * text sits: the middle of a linear one, the center of a radial one,
     * between the stops around that place; null for any other (several
     * layers, a conic or repeating one, a stop with no fixed color).
     * @param {string} v
     * @returns {string | null}
     */
    const colorBehindText = v => {
      const m = /^(linear|radial)-gradient\((.*)\)$/s.exec(v.trim());
      if (!m || splitTop(v.trim(), ',').length !== 1) return null;
      const args = splitTop(m[2], ',').map(x => x.trim());
      if (
        args[0] &&
        /^(to\b|at\b|-?[\d.]+(deg|turn|rad|grad)\b|circle\b|ellipse\b|closest|farthest)/.test(
          args[0],
        )
      )
        args.shift();
      /** @type {Array<{c: [number, number, number], a: number, at: number | null}>} */
      const stops = [];
      for (const arg of args) {
        const pos = /\s(-?[\d.]+)%$/.exec(arg);
        const color = arg.replace(/(\s+-?[\d.]+(%|px|rem|em)?)+$/, '').trim();
        const c = parseColor(color);
        if (!c) return null;
        stops.push({
          c,
          a: alphaOf(color),
          at: pos ? Number(pos[1]) / 100 : null,
        });
      }
      if (stops.length < 2) return null;
      // Positions a stop leaves out are spread evenly, as CSS spreads them.
      stops.forEach((x, i) => {
        if (x.at == null) x.at = i / (stops.length - 1);
      });
      const at = m[1] === 'linear' ? 0.5 : 0;
      const i = stops.findIndex(x => /** @type {number} */ (x.at) >= at);
      if (i <= 0) {
        const x = stops[Math.max(0, i)];
        return `rgba(${x.c.join(', ')}, ${x.a})`;
      }
      const [lo, hi] = [stops[i - 1], stops[i]];
      const span =
        /** @type {number} */ (hi.at) - /** @type {number} */ (lo.at);
      const f = span > 0 ? (at - /** @type {number} */ (lo.at)) / span : 0;
      const mix = lo.c.map((v0, k) => Math.round(v0 + (hi.c[k] - v0) * f));
      return `rgba(${mix.join(', ')}, ${lo.a + (hi.a - lo.a) * f})`;
    };
    /** @type {Array<{part: string, mode: string, ratio: number, sample: string, fg: string, fgToken: string | null, textPart: string | null, when: string | null, bgPart: string | null, bg: string, ground: [number, number, number], over: string | null, pair: any}>} */
    const out = [];
    const seen = new Set();
    /** @type {Set<string>} */
    const unchecked = new Set();
    // A census pair the caller measures again per variant (`replaces`) is
    // measured only as those.
    const replaced = new Set(
      extra.map((/** @type {any} */ x) => x.replaces).filter(Boolean),
    );
    for (const p of [...parts.pairs, ...extra]) {
      if (replaced.has(p)) continue;
      // Text drawn in a disabled color marks an inactive control, which
      // needs no 4.5:1 (and must stay dimmer than the live text beside it).
      if (/^--color-(text|icon)-disabled$/.test(String(p.fg.tokens[0])))
        continue;
      // (Text on another part that sets text of its own takes that part's
      // text; a part's own color set on it, `ownColor`, is its text there.)
      if (
        p.fg.target !== p.bg.target &&
        p.bg.target &&
        !(/** @type {any} */ (p).ownColor) &&
        partReads(p.bg.target, 'text').length
      )
        continue;
      for (const m of modes) {
        const fg = value(p, 'fg', m);
        const whole = value(p, 'bg', m);
        // The region a part sits in shows through its see-through background.
        const region = p.over ? {...p, bg: p.over} : null;
        const beneath = region ? value(region, 'bg', m) : page(m);
        const baseBeneath = region ? baseValue(region, 'bg', m) : page(m);
        // Over a region, only a see-through background shows it: an opaque
        // one is measured as the pair itself already is.
        if (
          region &&
          !(/** @type {any} */ (p).mediaOf) &&
          alphaOf(whole) >= 1 &&
          !/gradient|url\(/.test(String(whole))
        )
          continue;
        // A gradient is measured where the text sits on it: a linear or
        // radial one at the color it has under the text (its middle, or its
        // center), so a glossy highlight at an edge is not taken for the
        // ground; any other at each of its color stops, the worst one
        // counting. An image, or a stop with no fixed color, is not checked.
        const behind = /gradient/.test(String(whole))
          ? colorBehindText(String(whole))
          : null;
        const stops = behind
          ? [behind]
          : /gradient|url\(/.test(String(whole))
            ? gradientStops(String(whole))
            : [whole];
        if (!stops) {
          if (whole !== baseValue(p, 'bg', m)) unchecked.add(String(whole));
          continue;
        }
        const measured = stops.map(stop => ({
          stop,
          pair: drawn(fg, stop, m, beneath),
        }));
        if (stops.length > 1 && measured.some(x => !x.pair)) {
          if (whole !== baseValue(p, 'bg', m)) unchecked.add(String(whole));
          continue;
        }
        const worst = measured.reduce((a, b) =>
          a.pair &&
          b.pair &&
          ratio(b.pair[0], b.pair[1]) < ratio(a.pair[0], a.pair[1])
            ? b
            : a,
        );
        const bg = worst.stop;
        const pair = worst.pair;
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
        const was = drawn(
          baseValue(p, 'fg', m),
          baseValue(p, 'bg', m),
          m,
          baseBeneath,
        );
        // No worse than the base theme draws it: none of the theme's own,
        // and where the theme draws neither side, the base theme's own
        // failure (`base`), a note with its line.
        const baseDrawn =
          fg === baseValue(p, 'fg', m) &&
          bg === baseValue(p, 'bg', m) &&
          beneath === baseBeneath;
        if (was && ratio(was[0], was[1]) <= r + 0.05 && !baseDrawn) continue;
        const base = Boolean(was && ratio(was[0], was[1]) <= r + 0.05);
        // Pairs alike in color are one problem only when they read the same
        // token on the same part: text on another token or on another part
        // is another fix, and shows as they part ways.
        const key = `${p.text}|${p.fg.tokens[0] ?? ''}|${p.bg.target ?? ''}|${fg}|${bg}|${beneath}|${m}`;
        if (seen.has(key)) continue;
        seen.add(key);
        out.push({
          part: p.text,
          mode: m,
          // (Cut down, never rounded up: just under a need never meets it.)
          ratio: Math.floor(r * 100 + 1e-9) / 100,
          sample: p.sample,
          // A side the theme changed is named by the value it set, not the
          // token the part reads without it.
          // (So is one the base theme's own rule draws, not its token.)
          fg:
            fg !== baseValue(p, 'fg', m) || drawnByRule(p, 'fg', m)
              ? String(fg)
              : (p.fg.tokens[0] ?? String(fg)),
          bgPart: p.bg.target,
          // What shows through a see-through background, when it is the
          // region the part sits in.
          over:
            region && alphaOf(bg) < 1
              ? `${p.over?.target}'s ${beneath !== baseBeneath ? String(beneath) : (p.over?.tokens[0] ?? String(beneath))}`
              : null,
          bg: behind
            ? `${bg}, its gradient where the text sits`
            : stops.length > 1
              ? `${bg}, a stop of its gradient`
              : bg !== baseValue(p, 'bg', m) || drawnByRule(p, 'bg', m)
                ? String(bg)
                : (p.bg.tokens[0] ?? String(bg)),
          // What a fix needs: the token the text reads, the part that draws
          // it, the variant it was measured in, and the opaque color the
          // text sits on.
          fgToken: p.fg.tokens[0] ?? null,
          textPart: p.fg.target ?? null,
          when: /** @type {any} */ (p).when ?? null,
          ground: pair[1],
          pair: p,
          ...(base ? {base: true} : {}),
        });
      }
    }
    return {
      problems: out,
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

  /** @type {Map<string, string[]>} */
  const propsCache = new Map();
  /**
   * The CSS properties anything in the catalog reads a token in.
   * @param {string} tok
   */
  const propsReading = tok => {
    let r = propsCache.get(tok);
    if (!r) {
      /** @type {Set<string>} */
      const out = new Set();
      for (const t of Object.values(MAP)) {
        for (const [prop, v] of Object.entries(t.own ?? {}))
          if (tok in v.tokens) out.add(prop);
        for (const [k, v] of Object.entries(t.inside ?? {}))
          if (k === tok)
            for (const p of /** @type {string[]} */ (v)) out.add(p);
      }
      r = [...out];
      propsCache.set(tok, r);
    }
    return r;
  };

  return {
    MAP,
    typeOf,
    isToken,
    propsReading,
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
