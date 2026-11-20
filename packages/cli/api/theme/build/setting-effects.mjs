// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The theme settings a build writes that do not show as written,
 * read from the component rules Core generates for the theme (the CSS the
 * browser gets).
 *
 * A declaration of the theme is one its sources write (its own file and
 * the local themes it extends; the caller says where). It does not show as written when another rule of the theme
 * layer that reaches the same element sets the same property (or a
 * shorthand over it, or a longhand of it) to another value and wins there,
 * by specificity or, at equal specificity, by coming later:
 * - `hidden`: the other rule reaches every element and state the setting
 *   reaches, so it never shows (a shorthand after its own longhand in one
 *   rule, a same-weight rule later, a more specific rule of the same
 *   situation);
 * - `loses`: the other rule reaches a narrower situation (a variant, a
 *   state), where the setting does not show;
 * - `collides`: neither situation holds the other, and where both reach
 *   one element, the cascade decides which shows, by order or weight
 *   rather than by what the theme says. Reported for the setting whichever
 *   way it ends (`wins` tells), since a reorder flips it.
 *
 * Rules in different conditions (a color mode's ancestors, a media query)
 * are compared only with rules of the same conditions or none.
 *
 * @position api/theme/build — one reader for `theme build`, and through it
 *   the editor's build, show and doctor
 */

import {
  coversProperty,
  cssTree,
  keptCssTreeAnswer,
  longhandsOf,
} from '../../../foundation/runtime/css-tree.mjs';

/**
 * @typedef {object} RuleSide
 * @property {string} part - the part (its class without the `astryx-` prefix)
 * @property {string} key - the style key: `base`, a state (`selected`) or `prop:value` pairs joined with `+`
 * @property {string | null} state - the pseudo-classes the rule adds (`:hover`), or null
 * @property {string | null} element - the pseudo-element it styles (`::before`), or null
 * @property {string[]} conditions - the rule's other conditions: ancestors and media queries, as written
 * @property {string} property - the property, as written
 * @property {string} value - the value, as written
 * @property {'theme' | 'extended'} from - whether the setting's own source writes it, or a theme that source extends (or Core) does
 * @property {string} signature - what tells the rule's situation from others (`blockPaths` keys)
 */

/**
 * @typedef {{
 *   kind: 'hidden' | 'loses' | 'collides',
 *   wins: boolean,
 *   by: RuleSide & {path: string[] | null},
 *   why: string,
 * }} SettingRival - one rule that keeps a setting from showing as written,
 *   and how
 */

/**
 * @typedef {RuleSide & {
 *   path: string[] | null,
 *   kind: 'hidden' | 'loses' | 'collides',
 *   wins: boolean,
 *   by: RuleSide & {path: string[] | null},
 *   against: SettingRival[],
 *   why: string,
 * }} SettingEffectIssue
 */

/**
 * @typedef {object} Decl
 * @property {string} selector
 * @property {string} property
 * @property {string} value
 * @property {boolean} important
 * @property {number} order
 * @property {number} rule - which rule of the stylesheet it is in
 * @property {Situation} at
 */

/**
 * @typedef {object} Situation
 * @property {string} part
 * @property {Map<string, string | null>} attrs - attribute name to value (null: present)
 * @property {string[]} states - pseudo-classes and other subject conditions, as written
 * @property {string} element - the pseudo-element the rule styles (`::before`), or empty for the element itself
 * @property {string[]} conditions - zero-weight and ancestor conditions, and media queries, as written
 * @property {[number, number, number]} specificity
 */

const PART_CLASS = /^astryx-(.+)$/;

/** @param {any} node @returns {string} */
const text = node => cssTree().generate(node);

/**
 * The specificity of a selector node list, by Selectors Level 4.
 * @param {any[]} nodes
 * @returns {[number, number, number]}
 */
function specificityOf(nodes) {
  /** @type {[number, number, number]} */
  const s = [0, 0, 0];
  for (const n of nodes) {
    if (n.type === 'IdSelector') s[0]++;
    else if (n.type === 'ClassSelector' || n.type === 'AttributeSelector')
      s[1]++;
    else if (n.type === 'TypeSelector' && n.name !== '*') s[2]++;
    else if (n.type === 'PseudoElementSelector') s[2]++;
    else if (n.type === 'PseudoClassSelector') {
      const name = n.name.toLowerCase();
      if (name === 'where') continue;
      const list = selectorsIn(n);
      if (['is', 'not', 'has', 'matches'].includes(name)) {
        const most = list.map(specificityOf).sort(compare).at(-1);
        if (most) add(s, most);
      } else if (/^nth-(last-)?child$/.test(name) && list.length) {
        s[1]++;
        const most = list.map(specificityOf).sort(compare).at(-1);
        if (most) add(s, most);
      } else s[1]++;
    }
  }
  return s;
}

/** @param {[number, number, number]} a @param {[number, number, number]} b */
const add = (a, b) => {
  a[0] += b[0];
  a[1] += b[1];
  a[2] += b[2];
};

/** @param {[number, number, number]} a @param {[number, number, number]} b */
const compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/**
 * The selectors inside a pseudo-class's argument, each as its node list.
 * @param {any} node
 * @returns {any[][]}
 */
function selectorsIn(node) {
  /** @type {any[][]} */
  const out = [];
  const visit = (/** @type {any} */ n) => {
    if (!n) return;
    if (n.type === 'Selector') out.push(n.children.toArray());
    else if (n.children?.toArray) for (const c of n.children.toArray()) visit(c);
  };
  for (const c of node.children?.toArray?.() ?? []) visit(c);
  return out;
}

/**
 * The situation a selector reaches: its part, the attributes and states its
 * subject requires, and the rest as conditions. Null for a selector that
 * reaches no part.
 * @param {any[]} nodes
 * @param {string[]} media
 * @returns {Situation | null}
 */
function situationOf(nodes, media) {
  let lastCombinator = -1;
  nodes.forEach((n, i) => {
    if (n.type === 'Combinator') lastCombinator = i;
  });
  const subject = nodes.slice(lastCombinator + 1);
  /** @type {Situation} */
  const at = {
    part: '',
    attrs: new Map(),
    states: [],
    element: '',
    conditions: [...media],
    specificity: specificityOf(nodes),
  };
  if (lastCombinator >= 0)
    at.conditions.push(text({type: 'Selector', children: listOf(nodes.slice(0, lastCombinator))}));
  /** @param {any[]} compound */
  const read = compound => {
    for (const n of compound) {
      if (n.type === 'ClassSelector') {
        const m = PART_CLASS.exec(n.name);
        if (m && !at.part) at.part = m[1];
        else at.states.push(text(n));
      } else if (n.type === 'AttributeSelector') {
        const value = n.value
          ? n.value.type === 'String'
            ? n.value.value
            : text(n.value)
          : null;
        at.attrs.set(n.name.name, value);
      } else if (n.type === 'PseudoClassSelector') {
        const name = n.name.toLowerCase();
        const list = selectorsIn(n);
        if (
          name === 'is' &&
          list.length === 1 &&
          !list[0].some(c => c.type === 'Combinator')
        )
          read(list[0]);
        else if (name === 'where') at.conditions.push(text(n));
        else at.states.push(text(n));
      } else if (n.type === 'PseudoElementSelector') at.element += text(n);
      else at.states.push(text(n));
    }
  };
  read(subject);
  return at.part ? at : null;
}

/** @param {any[]} nodes */
function listOf(nodes) {
  const {List} = cssTree();
  const list = new List();
  for (const n of nodes) list.appendData(n);
  return list;
}

/** The media conditions Core wraps a themed `:active` in (the press model). */
const COARSE_POINTER = new Set(['(pointer:coarse)', 'notalland(pointer:coarse)']);

/**
 * Every declaration of a list of rules, in cascade order, with the
 * situation its selector reaches (one per selector of a list).
 * @param {string[]} rules
 * @returns {Decl[]}
 */
export function declarationsOf(rules) {
  const csstree = cssTree();
  const ast = csstree.parse(rules.join('\n'), {
    parseValue: false,
    parseCustomProperty: false,
  });
  /** @type {Decl[]} */
  const out = [];
  let order = 0;
  let rule = 0;
  /** @param {any} node @param {string[]} media @param {boolean} [coarse] */
  const walk = (node, media, coarse = false) => {
    for (const child of node.children?.toArray?.() ?? []) {
      if (child.type === 'Atrule') {
        const prelude = child.prelude ? text(child.prelude) : '';
        // A themed `:active` is one setting Core writes twice: as `:active`
        // off a coarse pointer, and under one as its press attribute. The
        // first is read as plain `:active`; the press copy is skipped.
        const bare = prelude.replace(/\s+/g, '');
        if (child.name === 'media' && COARSE_POINTER.has(bare)) {
          if (child.block) walk(child.block, media, bare === '(pointer:coarse)');
          continue;
        }
        if (child.block)
          walk(child.block, [...media, `@${child.name} ${prelude}`.trim()], coarse);
        continue;
      }
      if (child.type !== 'Rule' || child.prelude?.type !== 'SelectorList')
        continue;
      if (coarse && text(child.prelude).includes('[data-astryx-press')) continue;
      const selectors = child.prelude.children.toArray();
      rule++;
      for (const d of child.block.children.toArray()) {
        if (d.type !== 'Declaration') continue;
        order++;
        const value = String(
          d.value?.type === 'Raw' ? d.value.value : text(d.value),
        ).trim();
        for (const sel of selectors) {
          const at = situationOf(sel.children.toArray(), media);
          if (!at) continue;
          out.push({
            selector: text(sel),
            property: d.property.toLowerCase(),
            value,
            important: Boolean(d.important),
            order,
            rule,
            at,
          });
        }
      }
    }
  };
  walk(ast, []);
  return out;
}

/**
 * The declarations of a list of rules (declarationsOf), kept between runs by
 * the rules' text (keptCssTreeAnswer), so a build of an unchanged theme reads
 * them back and loads no css-tree. A situation's attributes are kept as their
 * entries, in order, and read back into a Map.
 * @param {string[]} rules
 * @returns {Decl[]}
 */
function keptDeclarationsOf(rules) {
  return keptCssTreeAnswer('theme-rule-declarations', rules, list =>
    declarationsOf(list).map(d => ({
      ...d,
      at: {...d.at, attrs: [...d.at.attrs]},
    })),
  ).map(d => ({...d, at: {...d.at, attrs: new Map(d.at.attrs)}}));
}

/**
 * The style key a situation's attributes name (`base` with none).
 * @param {Situation} at
 */
function keyOf(at) {
  const pairs = [...at.attrs].map(([name, value]) => {
    const prop = name
      .replace(/^data-/, '')
      .replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());
    return value == null || value === prop ? prop : `${prop}:${value}`;
  });
  return pairs.length ? pairs.join('+') : 'base';
}

/**
 * Whether `b`'s situation holds wherever `a`'s does (`b` asks nothing `a`
 * does not).
 * @param {Situation} a
 * @param {Situation} b
 * @param {boolean} [conditions] whether `b`'s other conditions count too
 */
function within(a, b, conditions = true) {
  for (const [name, value] of b.attrs)
    if (!a.attrs.has(name) || a.attrs.get(name) !== value) return false;
  return (
    b.states.every(s => a.states.includes(s)) &&
    (!conditions || b.conditions.every(c => a.conditions.includes(c)))
  );
}

/**
 * The selectors a zero-weight `:not()` condition rules out (the guard Core
 * adds to a hover rule rules out a disabled control).
 * @param {string} condition
 * @returns {string[]}
 */
function ruledOut(condition) {
  const m = /^:where\(:not\((.*)\)\)$/.exec(condition);
  return m ? splitList(m[1]) : [];
}

/** @param {string} list */
function splitList(list) {
  /** @type {string[]} */
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < list.length; i++) {
    const c = list[i];
    if (c === '(' || c === '[') depth++;
    else if (c === ')' || c === ']') depth--;
    else if (c === ',' && depth === 0) {
      out.push(list.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(list.slice(start).trim());
  return out.filter(Boolean);
}

/**
 * Whether `b` asks for a state or an attribute `a` does not.
 * @param {Situation} a
 * @param {Situation} b
 */
function addsState(a, b) {
  return (
    b.states.some(st => !a.states.includes(st)) ||
    [...b.attrs].some(([name]) => !a.attrs.has(name))
  );
}

/**
 * Whether `b` is a variant of `a`'s part at rest or in `a`'s state: an
 * attribute it adds is a visual prop with a value (`variant:primary`, a
 * row's parity), not only a runtime state (`selected`, `disabled`), and it
 * adds no other state.
 * @param {Situation} a
 * @param {Situation} b
 */
function variantRival(a, b) {
  const added = [...b.attrs].filter(([name]) => !a.attrs.has(name));
  return (
    added.some(
      ([name, value]) => value != null && value !== name.replace(/^data-/, ''),
    ) && b.states.every(st => a.states.includes(st))
  );
}

/**
 * Whether a property is one of Core's private variables (`--_…`,
 * `--astryx-…`): Core's own plumbing (a card's padding sides), written for
 * a setting, never a setting itself.
 * @param {string} property
 */
const privateVariable = property => /^--(?:_|astryx-)/.test(property);

/**
 * Whether a situation's attributes hold a prop named for the property, so
 * the rule carries the choice made where the part is used.
 * @param {string} property
 * @param {Situation} at
 */
function choiceAtUse(property, at) {
  for (const name of at.attrs.keys()) {
    const prop = name.replace(/^data-/, '');
    if (property === prop || property.endsWith(`-${prop}`)) return true;
  }
  return false;
}

/**
 * Whether one element can be in both situations at once. Two sets of
 * other conditions are compared only when equal, or when one has none.
 * @param {Situation} a
 * @param {Situation} b
 */
function meet(a, b) {
  // A pseudo-element (`::before`) is a box of its own.
  if (a.part !== b.part || a.element !== b.element) return false;
  for (const [name, value] of b.attrs)
    if (a.attrs.has(name) && a.attrs.get(name) !== value) return false;
  const cond = (/** @type {Situation} */ s) =>
    s.conditions.filter(c => !ruledOut(c).length);
  const ca = cond(a);
  const cb = cond(b);
  if (
    ca.length &&
    cb.length &&
    !(ca.every(c => cb.includes(c)) || cb.every(c => ca.includes(c)))
  )
    return false;
  // A guard ruling out a state meets no rule of that state.
  /** @param {Situation} x @param {Situation} y */
  const excludes = (x, y) =>
    x.conditions.some(c => {
      const out = ruledOut(c);
      return y.states.some(
        s =>
          out.includes(s) ||
          /^:is\((.*)\)$/.test(s) &&
            splitList(s.slice(4, -1)).every(i => out.includes(i)),
      );
    });
  return !excludes(a, b) && !excludes(b, a);
}

/** @param {Decl} d @param {'theme' | 'extended'} from @returns {RuleSide} */
function side(d, from) {
  return {
    part: d.at.part,
    key: keyOf(d.at),
    state: d.at.states.length ? d.at.states.join('') : null,
    element: d.at.element || null,
    conditions: d.at.conditions,
    property: d.property,
    value: d.value,
    from,
    signature: signatureOf(d.at),
  };
}

/** @param {RuleSide} s */
const situationText = s =>
  `${s.part}${s.element ?? ''}${s.key === 'base' ? '' : ` ${s.key}`}${s.state ? ` ${s.state}` : ''}`;

/**
 * The theme's settings that do not show as written.
 * @param {string[]} rules - the theme's component rules, as Core generates them
 * @param {(at: RuleSide) => {path: string[], layer: number} | null} writtenAt -
 *   where the theme's sources write a declaration: its key path, and which
 *   source (0 for the theme's own file, then each theme it extends, in
 *   order); null for one no source of the theme writes (Core adds it, or
 *   an installed theme it extends holds it)
 * @param {{skip?: (at: RuleSide) => boolean}} [options] - `skip`: a rule
 *   that takes no part (one whose selector nothing matches)
 * @returns {SettingEffectIssue[]}
 */
export function settingEffectIssues(rules, writtenAt, {skip} = {}) {
  const decls = keptDeclarationsOf(rules).filter(
    d => !skip?.(side(d, 'theme')),
  );
  /** @type {Map<Decl, {path: string[], layer: number} | null>} */
  const written = new Map();
  const writtenOf = (/** @type {Decl} */ d) => {
    if (!written.has(d)) written.set(d, writtenAt(side(d, 'theme')));
    return written.get(d) ?? null;
  };
  const layerOf = (/** @type {Decl} */ d) => writtenOf(d)?.layer ?? Infinity;
  /** @type {Map<string, Decl[]>} */
  const byPart = new Map();
  for (const d of decls) {
    const list = byPart.get(d.at.part) ?? [];
    list.push(d);
    byPart.set(d.at.part, list);
  }
  const rank = {hidden: 0, loses: 1, collides: 2};
  /** @type {Map<string, SettingEffectIssue>} */
  const found = new Map();
  /**
   * How a rule `b` keeps the setting `a` from showing as written, or null.
   * @param {Decl} a @param {Decl} b @param {number} layer
   */
  const against = (a, b, layer) => {
    if (b === a || b.value === a.value || !meet(a.at, b.at)) return null;
    // A rule for a prop named for the property (a Text `size` for
    // font-size, a `weight` for font-weight, a `color` for color) is the
    // choice made where the part is used: it is meant to win.
    if (choiceAtUse(a.property, b.at)) return null;
    const whole =
      b.property === a.property || coversProperty(b.property, a.property);
    // A longhand of the setting's shorthand refines it; only one the
    // theme did not write (the extended theme's, or Core's) takes part
    // of it away.
    const part = !whole && longhandsOf(a.property).has(b.property);
    if (!whole && !part) return null;
    /** @type {'theme' | 'extended'} */
    const theirs = layerOf(b) === layer ? 'theme' : 'extended';
    if (part && theirs === 'theme') return null;
    const weight = compare(b.at.specificity, a.at.specificity);
    const bWins =
      b.important !== a.important
        ? b.important
        : weight > 0 || (weight === 0 && b.order > a.order);
    const covers = within(a.at, b.at);
    // Narrower: wherever the two meet, `b` asks for more (a variant, a
    // state); a condition only `a` has (its color mode) leaves `b` the
    // narrower there.
    const narrower = !covers && within(b.at, a.at, false);
    /** @type {'hidden' | 'loses' | 'collides' | null} */
    let kind = null;
    if (bWins)
      kind =
        covers && whole ? 'hidden' : covers || narrower ? 'loses' : 'collides';
    // A setting that wins only by coming later, where an extended rule
    // of its weight reaches another situation of the same element.
    else if (
      weight === 0 &&
      !covers &&
      !narrower &&
      a.important === b.important
    )
      kind = 'collides';
    if (!kind) return null;
    // A rule that adds a runtime state (`:hover`, `selected`) and no visual
    // prop is that state's own look: a resting setting is not meant to show
    // there, whoever wrote the rule.
    if (kind !== 'hidden' && addsState(a.at, b.at) && !variantRival(a.at, b.at))
      return null;
    // Where both hold, a rule of the theme for that very situation (the
    // variant's own hover, or the variant's own value in the setting's
    // color mode) says what shows there: nothing collides or loses.
    if (
      (kind === 'collides' || kind === 'loses') &&
      settledWhereBoth(a, b, layer)
    )
      return null;
    // The same source's rule of a narrower situation (a variant's own
    // color), or of another state (disabled over focused, selected over
    // hovered), is that source saying what shows there: only one that
    // hides the setting everywhere, or a variant of it that beats it where
    // both hold (a striped row's fill over the whole-row hover), counts.
    if (
      theirs === 'theme' &&
      (kind === 'loses' ||
        (kind === 'collides' && (!bWins || !variantRival(a.at, b.at))))
    )
      return null;
    return {kind, wins: !bWins, theirs, weight, part};
  };
  /**
   * Whether a rule of the theme (`a`'s source or one nearer) reaches
   * exactly where `a` and `b` both hold, sets the property and wins there
   * over `b`.
   * @param {Decl} a @param {Decl} b @param {number} layer
   */
  const settledWhereBoth = (a, b, layer) => {
    /** @type {Situation} */
    const both = {
      ...a.at,
      attrs: new Map([...a.at.attrs, ...b.at.attrs]),
      states: [...new Set([...a.at.states, ...b.at.states])],
      conditions: [...new Set([...a.at.conditions, ...b.at.conditions])],
    };
    return (byPart.get(a.at.part) ?? []).some(c => {
      if (c === a || c === b || layerOf(c) > layer) return false;
      if (c.at.element !== a.at.element) return false;
      if (c.property !== a.property && !coversProperty(c.property, a.property))
        return false;
      if (!within(both, c.at)) return false;
      const weight = compare(c.at.specificity, b.at.specificity);
      return weight > 0 || (weight === 0 && c.order > b.order);
    });
  };
  for (const a of decls) {
    const layer = layerOf(a);
    if (layer === Infinity || privateVariable(a.property)) continue;
    const rivals = byPart.get(a.at.part) ?? [];
    // A setting a nearer source hides everywhere it reaches (the theme's
    // own file over a theme it extends) is that source's choice: none of
    // its other rivals keeps anything from showing.
    if (
      rivals.some(
        b =>
          layerOf(b) < layer &&
          against(a, b, layerOf(b))?.kind === 'hidden',
      )
    )
      continue;
    const mine = {...side(a, 'theme'), path: writtenOf(a)?.path ?? null};
    const id = `${mine.part}\u0000${mine.element}\u0000${mine.key}\u0000${mine.state}\u0000${mine.conditions.join(' ')}\u0000${mine.property}`;
    for (const b of rivals) {
      // A source nearer the theme overriding one it extends says what
      // shows: only the same source, or one the theme extends, counts.
      if (layerOf(b) < layer) continue;
      const how = against(a, b, layer);
      if (!how) continue;
      const by = {...side(b, how.theirs), path: writtenOf(b)?.path ?? null};
      const entry = {
        kind: how.kind,
        wins: how.wins,
        by,
        why: whyOf(how.kind, how.wins, mine, by, how.weight, how.part),
      };
      const prev = found.get(id);
      // Every rule that keeps it from showing is listed; the most severe
      // leads.
      if (!prev) found.set(id, {...mine, ...entry, against: [entry]});
      else {
        prev.against.push(entry);
        if (rank[entry.kind] < rank[prev.kind]) Object.assign(prev, entry);
      }
    }
  }
  return [...found.values()];
}

/**
 * @param {'hidden' | 'loses' | 'collides'} kind
 * @param {boolean} wins
 * @param {RuleSide} mine
 * @param {RuleSide & {path?: string[] | null}} theirs
 * @param {number} weight
 * @param {boolean} part - the other rule sets one longhand of the setting's shorthand
 */
function whyOf(kind, wins, mine, theirs, weight, part) {
  const whose =
    theirs.from === 'extended' ? 'the theme it extends, or Core' : 'this theme';
  const where = theirs.path
    ? pathText(theirs.path.slice(0, -1))
    : situationText(theirs);
  const other = `${theirs.property}: ${theirs.value} (${where}, from ${whose})`;
  const same = theirs.property === mine.property;
  const sets = same
    ? 'sets it again'
    : part
      ? `sets ${theirs.property}, part of ${mine.property}`
      : `sets ${mine.property} through ${theirs.property}`;
  if (kind === 'hidden')
    return `never shows: ${other} ${sets}${weight > 0 ? ' with a more specific selector' : ' later at the same weight'}`;
  if (kind === 'loses')
    return `does not show on ${situationText(theirs)}: ${other} ${sets} there`;
  return wins
    ? `shows on ${situationText(theirs)} only because it comes later than ${other}, at the same weight`
    : `does not show where ${situationText(theirs)} also holds: ${other} ${sets} and wins ${weight > 0 ? 'by a more specific selector' : 'by coming later'}`;
}

/** @param {string} key */
const keyAccess = key =>
  /^[A-Za-z_$][\w$]*$/.test(key) ? `.${key}` : `[${JSON.stringify(key)}]`;

/**
 * A key path as a theme source reads: `components.tab.selected`.
 * @param {string[]} keys
 */
const pathText = keys =>
  keys[0] + keys.slice(1).map(keyAccess).join('');

/**
 * Where a side is written in a theme's source: its part, style key and
 * state block.
 * @param {{part: string, key: string, state: string | null, element?: string | null}} s
 */
export const settingPath = s => {
  // A pseudo-element ends the block key, after any state (`:hover::before`).
  const nested = `${s.state ?? ''}${s.element ?? ''}`;
  return `components${keyAccess(s.part)}${keyAccess(s.key)}${nested ? keyAccess(nested) : ''}`;
};

/**
 * A property as a theme source writes it: camelCase, a vendor prefix
 * capitalized (-webkit-line-clamp is WebkitLineClamp), a custom property
 * as it is.
 * @param {string} property
 */
const camel = property =>
  property.startsWith('--')
    ? property
    : property
        .replace(/^-([a-z])/, (_, c) => c.toUpperCase())
        .replace(/-([a-z])/g, (_, c) => c.toUpperCase());

/**
 * The key both situations hold in: every prop and state either names.
 * @param {string} a @param {string} b
 */
function bothKeys(a, b) {
  const pairs = new Set(
    [a, b].flatMap(k => (k === 'base' ? [] : k.split('+'))),
  );
  return pairs.size ? [...pairs].join('+') : 'base';
}

/**
 * A rule as a build reports it: its part, pseudo-element, style key,
 * state, other conditions, the property and value it sets, whether the
 * setting's own source writes it (`theme`) or a theme that source extends,
 * or Core (`extended`), and the key path a source writes it at (null when
 * no source of the theme does).
 * @typedef {{part: string, element: string | null, key: string, state: string | null, conditions: string[], property: string, value: string, from: 'theme' | 'extended', path: string[] | null}} SettingRuleEntry
 */

/**
 * A setting the browser does not show as written, as a build reports it:
 * the setting (as a rule), `kind` and `wins` for the rule that keeps it
 * from showing most (`by`), `why` in words, every such rule in `against`
 * (each `{kind, wins, by, why}`), the message and the change that makes it
 * show (`fix`).
 * @typedef {Omit<SettingRuleEntry, 'from' | 'path'> & {
 *   path: string[],
 *   kind: 'hidden' | 'loses' | 'collides',
 *   wins: boolean,
 *   by: SettingRuleEntry,
 *   why: string,
 *   against: Array<{kind: 'hidden' | 'loses' | 'collides', wins: boolean, by: SettingRuleEntry, why: string}>,
 *   message: string,
 *   fix: string,
 * }} SettingIssueEntry
 */

/**
 * A rule as reported, without what only the reader uses.
 * @param {RuleSide & {path?: string[] | null}} r
 * @returns {SettingRuleEntry}
 */
const ruleEntry = r => ({
  part: r.part,
  element: r.element,
  key: r.key,
  state: r.state,
  conditions: r.conditions,
  property: r.property,
  value: r.value,
  from: r.from,
  path: r.path ?? null,
});

/**
 * The issues as a build reports them: one per setting (a color-mode block
 * Core writes three ways is one), each with the source path it is written
 * at, its message and the change that makes it show as written.
 * @param {SettingEffectIssue[]} issues
 * @returns {SettingIssueEntry[]}
 */
export function settingIssueEntries(issues) {
  /** @type {Map<string, SettingIssueEntry>} */
  const out = new Map();
  for (const issue of issues) {
    // One per setting: by where its source writes it (a color-mode block
    // Core writes three ways shares that), else by its situation.
    const id = [
      issue.path?.join('\u0001') ?? issue.conditions.join(' '),
      issue.part,
      issue.key,
      issue.state,
      issue.element,
      issue.property,
      issue.value,
      issue.kind,
      issue.by.key,
      issue.by.state,
      issue.by.property,
    ].join('\u0000');
    if (out.has(id)) continue;
    const blockOf = (/** @type {{path?: string[] | null}} */ x) =>
      x.path ? pathText(x.path.slice(0, -1)) : null;
    const at = blockOf(issue) ?? settingPath(issue);
    // A fix for a setting of one color mode (`@light`) names a block of that
    // mode, so following it writes nothing in the other.
    const mode = issue.path?.find(k => /^@(?:light|dark)$/.test(k)) ?? null;
    /** @param {string[]} keys - components, part, key, then the rest */
    const inMode = keys =>
      mode && !keys.includes(mode)
        ? [...keys.slice(0, 3), mode, ...keys.slice(3)]
        : keys;
    /** @param {{part: string, key: string, state: string | null, element?: string | null, path?: string[] | null}} x */
    const blockKeys = x =>
      x.path
        ? x.path.slice(0, -1)
        : [
            'components',
            x.part,
            x.key,
            ...(x.state || x.element ? [`${x.state ?? ''}${x.element ?? ''}`] : []),
          ];
    const by = pathText(inMode(blockKeys(issue.by)));
    const prop = camel(issue.property);
    const other = camel(issue.by.property);
    let fix;
    if (issue.kind === 'hidden')
      fix =
        by === at
          ? `write ${prop} after ${other} in ${at}, or give its value in ${other}`
          : issue.by.signature === issue.signature
            ? other === prop
              ? `${by} builds the same rule as ${at}, later, and sets ${prop} again: write them as one block, with the ${prop} you want`
              : `${by} builds the same rule as ${at}, later: write them as one block, with ${prop} after ${other}`
            : `set ${prop} in ${by} instead: that rule wins everywhere this one reaches`;
    else if (issue.kind === 'loses')
      fix = `set ${prop} in ${by} too: that rule wins there`;
    else {
      const both = pathText(
        inMode(
          blockKeys({
            part: issue.part,
            key: bothKeys(issue.key, issue.by.key),
            state:
              [...new Set([issue.state, issue.by.state].filter(Boolean))].join(
                '',
              ) || null,
            element: issue.element,
          }),
        ),
      );
      fix = `set ${prop} in ${both}, so one rule says what shows when both hold`;
    }
    const {from: _from, path: _path, ...setting} = ruleEntry(issue);
    out.set(id, {
      ...setting,
      path: issue.path ?? [
        'components',
        issue.part,
        issue.key,
        ...(issue.state || issue.element
          ? [`${issue.state ?? ''}${issue.element ?? ''}`]
          : []),
        prop,
      ],
      kind: issue.kind,
      wins: issue.wins,
      by: ruleEntry(issue.by),
      why: issue.why,
      against: issue.against.map(r => ({
        kind: r.kind,
        wins: r.wins,
        by: ruleEntry(r.by),
        why: r.why,
      })),
      message: `${at}.${prop} (${issue.value}) ${issue.why}`,
      fix,
    });
  }
  return [...out.values()];
}

/**
 * What tells one situation from another: its part, pseudo-element,
 * attributes, states and other conditions.
 * @param {Situation} at
 */
const signatureOf = at =>
  JSON.stringify([
    at.part,
    at.element,
    [...at.attrs].sort(),
    [...at.states].sort(),
    [...at.conditions].sort(),
  ]);

/** The custom property each block of a probe carries its own value in. */
const PROBE = '--astryx-setting-probe';

/** @param {{signature: string, property: string, value: string}} d */
const declarationKey = d => `${d.signature}\u0000${d.property}\u0000${d.value}`;

/**
 * The style block of a theme's parts each declaration Core writes comes
 * from: Core generates the parts again, every block carrying a probe value
 * of its own beside its declarations, so each rule names its block. A
 * declaration maps back to the blocks a source writes it in, however the
 * key is spelled (`selected` and `selected:selected` build one selector,
 * and each keeps its own declarations) and however Core writes it (a
 * pressed state is two rules, a color mode three).
 * @param {Record<string, Record<string, any>>} components - the theme's resolved parts
 * @param {(components: Record<string, Record<string, any>>) => string[]} generate - Core's component rules for a map of parts
 * @returns {Map<string, string[][]>} each declaration (situation, property, value) to the block paths that write it
 */
export function blockPaths(components, generate) {
  /** @type {string[][]} */
  const paths = [];
  /** @param {any} block @param {string[]} at @param {boolean} modes */
  const probe = (block, at, modes) => {
    /** @type {Record<string, any>} */
    const out = {};
    if (block && typeof block === 'object')
      for (const [k, v] of Object.entries(block)) {
        if (v && typeof v === 'object' && k.startsWith(':'))
          out[k] = probe(v, [...at, k], false);
        else if (v && typeof v === 'object' && modes && (k === '@light' || k === '@dark'))
          out[k] = probe(v, [...at, k], true);
        else out[k] = v;
      }
    out[PROBE] = String(paths.push(at) - 1);
    return out;
  };
  /** @type {Record<string, Record<string, any>>} */
  const probes = {};
  for (const [part, keys] of Object.entries(components ?? {})) {
    if (!keys || typeof keys !== 'object') continue;
    probes[part] = {};
    for (const [key, block] of Object.entries(keys))
      probes[part][key] = probe(block, ['components', part, key], true);
  }
  const decls = keptDeclarationsOf(generate(probes));
  /** @type {Map<number, string[]>} */
  const blockOfRule = new Map();
  for (const d of decls)
    if (d.property === PROBE) {
      const at = paths[Number(d.value)];
      if (at) blockOfRule.set(d.rule, at);
    }
  /** @type {Map<string, string[][]>} */
  const out = new Map();
  for (const d of decls) {
    if (d.property === PROBE) continue;
    const at = blockOfRule.get(d.rule);
    if (!at) continue;
    const key = declarationKey({...d, signature: signatureOf(d.at)});
    const list = out.get(key) ?? [];
    if (!list.some(p => p.join('\u0000') === at.join('\u0000'))) list.push(at);
    out.set(key, list);
  }
  return out;
}

/**
 * The key paths a theme source may write a declaration at, from the blocks
 * that write it (`blockPaths`).
 * @param {RuleSide} at
 * @param {Map<string, string[][]>} blocks
 * @returns {string[][]}
 */
export function declarationPaths(at, blocks) {
  return (blocks.get(declarationKey(at)) ?? []).map(p => [
    ...p,
    camel(at.property),
  ]);
}


/**
 * Where a reported setting is written, as warnings say it: ` (line 12)`,
 * ` (themes/base/base.theme.ts, line 12)` in a file other than the one
 * built, or nothing when no line is known.
 * @param {{line?: number | null, file?: string}} entry
 */
export const settingIssueLocation = entry =>
  entry.line != null
    ? ` (${entry.file ? `${entry.file}, ` : ''}line ${entry.line})`
    : '';

/**
 * The note that stands for the settings a generated file writes that do not
 * show as written: their count, the file and the tool that writes it, and
 * where the full list is.
 * @param {number} count
 * @param {string} file - as the reader sees it
 * @param {string} [by] - the tool the file's generated mark names
 * @param {string} [listedBy] - what lists each setting (`--json` by default)
 */
export const generatedSettingNotice = (
  count,
  file,
  by,
  listedBy = '--json',
) => {
  const one = count === 1;
  return `${count} ${one ? 'setting' : 'settings'} that ${file} writes ${one ? 'does' : 'do'} not show as written; that file is generated, so fix ${one ? 'it' : 'them'} in its generator${by ? `, ${by}` : ''} (${listedBy} lists ${one ? 'it' : 'each'})`;
};

/**
 * One note of a generated file's settings: the file, as the reader sees it,
 * and the note's text.
 * @typedef {{file: string, text: string}} GeneratedSettingNote
 */

/**
 * The setting issues to name one by one, and one note per generated file
 * for the rest: a file that says a tool generates it is not where their fix
 * goes. `theme build` and `astryx doctor` both say them this way.
 * @template T
 * @param {Array<T & {file?: string | undefined}>} entries
 * @param {(file: string | undefined) => {by?: string} | null} generatedOf -
 *   whether the file that writes an entry (undefined: the theme's own) is
 *   generated, and by what
 * @param {(file: string | undefined) => string} shown - the file as the
 *   reader sees it
 * @param {{listedBy?: string}} [options] - `listedBy`: what lists each
 *   setting, as the note names it
 * @returns {{listed: Array<T & {file?: string | undefined}>, notes: GeneratedSettingNote[]}}
 */
export function splitGeneratedIssues(
  entries,
  generatedOf,
  shown,
  options = {},
) {
  /** @type {Array<T & {file?: string | undefined}>} */
  const listed = [];
  /** @type {Map<string | undefined, {count: number, by?: string}>} */
  const generated = new Map();
  for (const entry of entries) {
    const mark = generatedOf(entry.file);
    if (!mark) {
      listed.push(entry);
      continue;
    }
    const seen = generated.get(entry.file);
    generated.set(entry.file, {count: (seen?.count ?? 0) + 1, by: mark.by});
  }
  return {
    listed,
    notes: [...generated].map(([file, {count, by}]) => ({
      file: shown(file),
      text: generatedSettingNotice(count, shown(file), by, options.listedBy),
    })),
  };
}

/**
 * The notes of several builds (a family's members, doctor's local themes)
 * as one note per generated file: a theme that extends a generated one
 * reports that file's settings too. Each with the labels of every build
 * that reported it, in order.
 * @param {Array<{label?: string, notes: GeneratedSettingNote[]}>} reports
 * @returns {Array<GeneratedSettingNote & {labels: string[]}>}
 */
export function generatedNotesByFile(reports) {
  /** @type {Map<string, GeneratedSettingNote & {labels: string[]}>} */
  const byFile = new Map();
  for (const {label, notes} of reports)
    for (const note of notes) {
      const seen = byFile.get(note.file);
      if (!seen)
        byFile.set(note.file, {...note, labels: label == null ? [] : [label]});
      else if (label != null && !seen.labels.includes(label))
        seen.labels.push(label);
    }
  return [...byFile.values()];
}
