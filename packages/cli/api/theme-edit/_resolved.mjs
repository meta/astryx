// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What one part of a theme shows: each CSS property the part reads,
 * at rest and in each variant, with its final value in each mode, the
 * declaration that gives it, the tokens it reads, and who decides it (Core,
 * the theme it extends, or the theme's own file). The theme is any theme
 * the project builds: an editor theme, a local theme or an installed theme
 * package. It is loaded the way `theme build` loads it, and its tokens are
 * resolved by Core. Nothing is written.
 *
 * @input the project folder, a theme name, a part name
 * @output `themePartValues`: the `themeEdit.showPart` answer
 * @position api/theme-edit — `show <theme> --on <part>` (_edit.mjs)
 */

import * as path from 'node:path';
import {AstryxError} from '../error.mjs';
import {
  coversProperty,
  longhandsOf,
} from '../../foundation/runtime/css-tree.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {context} from './_context.mjs';
import {baseResolved} from './_project.mjs';
import {
  compileTheme,
  controlOf,
  editedThemes,
  loadTheme,
  stateSlot,
} from './_settings.mjs';
import {censusStatesOf} from './_parts.mjs';
import {
  mergeRules,
  ownTokens,
  partShows,
  partValues,
  resolveIn,
  scopedTokens,
} from './_how-commands.mjs';
import {FAMILIES, P} from './_tables.mjs';
import {condition} from './_how.mjs';

/** @typedef {{light: Record<string, string>, dark: Record<string, string>}} ModeTokens */

/**
 * A theme as the answer reads it: its tokens and part styles, and those of
 * the theme it extends (Core's defaults when it extends none).
 * @typedef {object} LoadedTheme
 * @property {'editor' | 'local' | 'package' | 'bundled'} kind
 * @property {ModeTokens} tokens
 * @property {Record<string, any>} components
 * @property {ModeTokens} parentTokens
 * @property {Record<string, any>} parentComponents
 * @property {ModeTokens} coreTokens - Core's own defaults
 * @property {(token: string, part: string, onPart: boolean) => 'token' | 'dial' | 'part'} [tokenVia] -
 *   for an editor theme: what writes a token, from its saved settings (an
 *   exact token setting, a dial, or a rule on the part); `onPart` when the
 *   part's own rule sets it
 * @property {(property: string, part: string, when: string, state: string) => {when: string | null, state: string | null, exact: boolean} | null} [settingAt] - The property setting that wrote the theme's rule on the part under a rule key (`when|state` as the build writes them), as `set` took it.
 * @property {(property: string, part: string, when: string, state: string) => 'dial' | 'part'} [propertyVia] -
 *   for an editor theme: what writes a CSS property the theme's own rule on
 *   the part sets under a condition (`when` as `set --when` takes it, null
 *   at rest): a property setting on the part for that condition that covers
 *   it, else a dial (on the part or on the whole theme)
 */

/**
 * A logical property as the physical one it sets in a left-to-right,
 * top-to-bottom page (`padding-inline-start` is `padding-left`): the two
 * cascade as one property.
 * @param {string} prop
 */
const physical = prop =>
  prop
    .replace(/-inline-start(?=$|-)/, '-left')
    .replace(/-inline-end(?=$|-)/, '-right')
    .replace(/-block-start(?=$|-)/, '-top')
    .replace(/-block-end(?=$|-)/, '-bottom')
    .replace(/^border-start-start-radius$/, 'border-top-left-radius')
    .replace(/^border-start-end-radius$/, 'border-top-right-radius')
    .replace(/^border-end-start-radius$/, 'border-bottom-left-radius')
    .replace(/^border-end-end-radius$/, 'border-bottom-right-radius')
    .replace(/^inset-inline-start$/, 'left')
    .replace(/^inset-inline-end$/, 'right')
    .replace(/^inset-block-start$/, 'top')
    .replace(/^inset-block-end$/, 'bottom');

/**
 * Whether a rule that sets `a` also sets what `b` shows: `b` is `a`, a
 * longhand of it, or a logical name of one of those.
 * @param {string} a
 * @param {string} b
 */
const sets = (a, b) =>
  a === b ||
  physical(a) === physical(b) ||
  coversProperty(a, b) ||
  coversProperty(physical(a), physical(b));

/**
 * A part's rules with each rule's `@light` and `@dark` blocks taken out,
 * and what those blocks set: a value for one mode of a property under the
 * rule's key, not a condition of its own.
 * @param {Record<string, any> | undefined} comp
 */
function foldModes(comp) {
  /** @type {Record<string, any>} */
  const rules = {};
  /** @type {{when: string, state: string, property: string, mode: 'light' | 'dark', value: string}[]} */
  const modeSets = [];
  for (const [when, rule] of Object.entries(comp ?? {})) {
    if (!rule || typeof rule !== 'object') {
      rules[when] = rule;
      continue;
    }
    /** @type {Record<string, any>} */
    const kept = {};
    for (const [k, v] of Object.entries(rule)) {
      if (k !== '@light' && k !== '@dark') {
        kept[k] = v;
        continue;
      }
      const mode = k === '@light' ? 'light' : 'dark';
      for (const [k2, v2] of Object.entries(v ?? {}))
        if (v2 && typeof v2 === 'object')
          for (const [k3, v3] of Object.entries(v2))
            modeSets.push({
              when,
              state: k2,
              property: kebab(k3),
              mode,
              value: String(v3),
            });
        else
          modeSets.push({
            when,
            state: '',
            property: kebab(k2),
            mode,
            value: String(v2),
          });
    }
    rules[when] = kept;
  }
  return {rules, modeSets};
}

/**
 * Whether two rule keys name one condition: a theme's own rule writes a
 * variant `variant:ghost`, Core writes `variant=ghost`, in any word order.
 * @param {string} a
 * @param {string} b
 */
const sameWhen = (a, b) => {
  /** @param {string} w */
  const words = w =>
    w
      .split(/[\s+]/)
      .filter(Boolean)
      .map(x => (/^[a-z][\w-]*:[^\s:]+$/i.test(x) ? x.replace(':', '=') : x))
      .sort()
      .join(' ');
  return words(a) === words(b);
};

/** @param {string} k */
const kebab = k =>
  k.startsWith('--') ? k : k.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);

/** A token Core keeps to itself (`--_x`, `--astryx-x`). @param {string} t */
const isPrivate = t => /^--(?:_|astryx-)/.test(t);

/**
 * The public tokens a declaration reads, in order, once each.
 * @param {string} value
 */
function tokensIn(value) {
  return [
    ...new Set(
      [...String(value).matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map(m => m[1]),
    ),
  ].filter(t => !isPrivate(t));
}

/**
 * The tokens a declaration reads in one mode, following each token's own
 * value to the tokens it reads in turn.
 * @param {string} value
 * @param {Record<string, string>} map
 */
function tokenChain(value, map) {
  /** @type {string[]} */
  const out = [];
  /** @param {string} v @param {number} depth */
  const walk = (v, depth) => {
    for (const t of tokensIn(v)) {
      if (out.includes(t)) continue;
      out.push(t);
      if (depth < 8 && map[t] != null) walk(map[t], depth + 1);
    }
  };
  walk(value, 0);
  return out;
}

/**
 * Load a theme by name: an editor theme first (it is the one `show` names
 * without more), else a theme the project lists (local, package or
 * bundled), loaded as `theme build` loads it.
 * @param {any} ctx the editor context
 * @param {string} cwd
 * @param {string} name
 * @returns {Promise<LoadedTheme>}
 */
async function loadNamedTheme(ctx, cwd, name) {
  const {core} = ctx.project;
  const coreDefaults = await baseResolved(ctx.project, undefined);
  if (editedThemes(cwd).includes(name)) {
    const data = loadTheme(cwd, name);
    const base = await baseResolved(ctx.project, data.like);
    const compiled = compileTheme(ctx, data, base);
    /** @param {import('./_settings.mjs').ThemeData['settings'][number]} st @param {string} part */
    const reaches = (st, part) =>
      st.on == null
        ? false
        : st.on === part || (FAMILIES[st.on] ?? []).includes(part);
    // A rule the theme writes on a part comes from a property setting on
    // it, matched by the rule key the build writes for that setting (its
    // `--when` and `--state` placed the way the build places them), else
    // from a dial: one on the part, or a whole-theme dial that writes part
    // rules (`surfaces outlined` writes the card's border).
    /** @type {NonNullable<LoadedTheme['settingAt']>} */
    const settingAt = (property, part, when, state) => {
      const t = ctx.project.target.get(part);
      const mine = data.settings.filter(
        s =>
          reaches(s, part) &&
          s.source === 'property' &&
          sets(String(s.thing), property),
      );
      /** @param {any} s */
      const slotOf = s =>
        stateSlot(
          t?.states ?? [],
          s.state,
          s.when,
          controlOf(ctx, part),
          t?.stateValues,
          censusStatesOf(ctx.project, part),
        );
      const exact = mine.find(s => {
        const slot = slotOf(s);
        return slot.key === when && (slot.pseudo ?? '') === state;
      });
      if (exact)
        return {
          when: exact.when ?? null,
          state: exact.state ?? null,
          exact: true,
        };
      // (A setting with no --when that the build copies into each variant
      // rule the part draws, as a card's fill: the part's, under the
      // variant's own condition.)
      const copied = mine.find(s => {
        const slot = slotOf(s);
        return (
          s.when == null &&
          when !== 'base' &&
          slot.key === 'base' &&
          (slot.pseudo ?? '') === state
        );
      });
      return copied
        ? {when: null, state: copied.state ?? null, exact: false}
        : null;
    };
    return {
      kind: 'editor',
      tokens: ownTokens(compiled, base, core),
      components: mergeComponents(base.components, compiled.components ?? {}),
      parentTokens: {light: base.light, dark: base.dark},
      parentComponents: base.components ?? {},
      coreTokens: {light: coreDefaults.light, dark: coreDefaults.dark},
      tokenVia: (token, part, onPart) => {
        const mine = data.settings.filter(st =>
          onPart ? reaches(st, part) : st.on == null,
        );
        if (mine.some(st => st.source === 'token' && st.thing === token))
          return 'token';
        if (mine.some(st => st.source === 'dial')) return 'dial';
        return onPart ? 'part' : 'token';
      },
      // A rule the theme writes on a part comes from a property setting
      // on it, else from a dial: one on the part, or a whole-theme dial
      // that writes part rules (`surfaces outlined` writes the card's
      // border).
      settingAt,
      propertyVia: (property, part, when, state) =>
        settingAt(property, part, when, state)
          ? 'part'
          : data.settings.some(
                st =>
                  st.source === 'dial' && (st.on == null || reaches(st, part)),
              )
            ? 'dial'
            : 'part',
    };
  }
  const found = await findProjectTheme(cwd, name);
  if (!found)
    throw new AstryxError(
      `No theme named "${name}" in this project: an editor theme, a local theme or an installed theme package.`,
      [
        {name: 'astryx theme list', reason: 'the themes this project has'},
        {name: `${P} new ${name} --like neutral`, reason: 'or start one'},
      ],
      ERROR_CODES.ERR_UNKNOWN_THEME,
    );
  const {loadThemeInput} = await import('../theme/build/build.mjs');
  const file = path.resolve(found.sourceDir, found.entry);
  const loaded = await loadThemeInput(file, {cwd, name: found.slug});
  if (!loaded?.theme)
    throw new AstryxError(
      `The ${found.slug} theme does not load${loaded?.error ? `: ${loaded.error.message}` : ''}.`,
      [
        {
          name: `astryx theme build ${path.relative(cwd, file) || file} --check`,
          reason: 'see why',
        },
      ],
      ERROR_CODES.ERR_THEME_INVALID,
    );
  const theme = loaded.theme;
  // The theme it extends, made again from its input as Core made it; Core's
  // defaults when it extends none.
  const parentInput = loaded.chain[0];
  const parent = parentInput ? core.defineTheme(parentInput) : null;
  return {
    kind: found.source,
    tokens: {
      light: core.resolveThemeTokens(theme, {mode: 'light'}),
      dark: core.resolveThemeTokens(theme, {mode: 'dark'}),
    },
    components: theme.components ?? {},
    parentTokens: parent
      ? {
          light: core.resolveThemeTokens(parent, {mode: 'light'}),
          dark: core.resolveThemeTokens(parent, {mode: 'dark'}),
        }
      : {light: coreDefaults.light, dark: coreDefaults.dark},
    parentComponents: parent?.components ?? {},
    coreTokens: {light: coreDefaults.light, dark: coreDefaults.dark},
  };
}

/**
 * Part styles with another theme's on top, rule by rule (a rule that sets
 * one property keeps the others).
 * @param {Record<string, any>} under
 * @param {Record<string, any>} over
 */
function mergeComponents(under, over) {
  /** @type {Record<string, any>} */
  const out = {};
  for (const part of new Set([
    ...Object.keys(under ?? {}),
    ...Object.keys(over ?? {}),
  ]))
    out[part] = mergeRules(under?.[part] ?? {}, over?.[part] ?? {});
  return out;
}

/**
 * One property of the part, as the answer gives it.
 * @typedef {import('./theme-edit.type.mjs').ThemeEditPartValue} PartValue
 */

/**
 * What one part of a theme shows.
 * @param {string} cwd
 * @param {string} name the theme
 * @param {string} part
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditShowPartResponse>}
 */
export async function themePartValues(cwd, name, part) {
  const ctx = await context(cwd);
  const key = String(part).trim().toLowerCase();
  if (Object.hasOwn(FAMILIES, key) && !ctx.project.target.has(key))
    throw new AstryxError(
      `${key} is a group; --on takes one part of it: ${FAMILIES[key].join(', ')}.`,
      FAMILIES[key].slice(0, 3).map((/** @type {string} */ m) => ({
        name: `${P} show ${name} --on ${m}`,
        reason: 'one part',
      })),
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  if (!ctx.project.target.has(key))
    throw new AstryxError(
      `No part named "${part}". --on takes a part, as \`${P} how --list parts\` lists them.`,
      [{name: `${P} how --list parts`, reason: 'every part'}],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  if (ctx.unchecked)
    throw new AstryxError(
      `What ${key} reads cannot be worked out here: ${ctx.unchecked}`,
      [{name: 'astryx doctor', reason: 'see why'}],
      ERROR_CODES.ERR_RENDER_FAILED,
    );
  const theme = await loadNamedTheme(ctx, cwd, name);
  // A rule's `@light` or `@dark` block is a value for one mode, read into
  // that mode's value below, not a condition.
  const folded = foldModes(theme.components?.[key]);
  const parentFolded = foldModes(theme.parentComponents?.[key]);
  const shows = partShows(
    ctx.C,
    {},
    {components: {...theme.components, [key]: folded.rules}},
    theme.tokens,
    key,
  );
  const own = partValues(folded.rules);
  const inherited = partValues(parentFolded.rules);
  const themeRules = mergeRules(folded.rules);
  const parentRules = mergeRules(parentFolded.rules);
  /**
   * The tokens inside the part under a condition, in each mode: the
   * theme's, the theme it extends, and Core's, each with what that theme's
   * own rule on the part sets.
   * @param {string} when
   */
  const inside = when => ({
    theme: {
      light: scopedTokens(themeRules, theme.tokens.light, when),
      dark: scopedTokens(themeRules, theme.tokens.dark, when),
    },
    parent: {
      light: scopedTokens(parentRules, theme.parentTokens.light, when),
      dark: scopedTokens(parentRules, theme.parentTokens.dark, when),
    },
  });
  /** @type {PartValue[]} */
  const values = [];
  /** @type {WeakMap<PartValue, {when: string, state: string, own: boolean}>} */
  const rawKey = new WeakMap();
  // The theme layer comes after Core's styles: a property a rule on the
  // part sets, in the same variant or at rest, is what shows for every
  // property it sets, whatever Core writes.
  const ruleProps = [...own.keys()].map(k => k.split('|'));
  /** @param {string} when @param {string} property */
  const ruledOver = (when, property) =>
    ruleProps.some(
      ([w, st, p]) =>
        !st &&
        (w === when || w === 'base') &&
        p !== property &&
        sets(p, property),
    );
  // A shorthand in a rule whose every longhand a later declaration of the
  // same rule sets shows none of its own value.
  const order = [...own.keys()];
  /** @param {string} k */
  const overwritten = k => {
    const [when, state, property] = k.split('|');
    const parts = [...longhandsOf(property)].map(physical);
    if (!parts.length) return false;
    const later = order
      .slice(order.indexOf(k) + 1)
      .map(x => x.split('|'))
      .filter(([w, st]) => w === when && st === state)
      .map(([, , p]) => physical(p));
    return parts.every(p => later.some(l => l === p || longhandsOf(l).has(p)));
  };
  const t = ctx.project.target.get(key);
  /**
   * A rule key's condition as the flags `set` takes, the way `how` gives
   * it: a theme rule a property setting wrote takes that setting's own
   * --when and --state; any other key is read the way Core reads a style
   * key (`variant:ghost+selected`, `variant=ghost`) and given to the same
   * converter `how <part>` uses. A condition no flag reaches keeps Core's
   * words and says why.
   * @param {string} when @param {string} state
   * @param {string | null} ruleProperty the property of the theme's own
   *   rule, or null for one of Core's
   * @returns {{when: string | null, state: string | null, notSettable?: string}}
   */
  const condOf = (when, state, ruleProperty) => {
    const wrote =
      ruleProperty != null && theme.settingAt
        ? theme.settingAt(ruleProperty, key, when, state)
        : null;
    if (wrote?.exact) return {when: wrote.when, state: wrote.state};
    const words = [
      ...(when === 'base' ? [] : when.split(/\+|\s+/)),
      ...(state ? [state] : []),
    ]
      .filter(Boolean)
      .map(w =>
        /^[a-z][\w-]*:[^\s:]+$/i.test(w)
          ? w.replace(':', '=')
          : /^[a-z][\w-]*$/i.test(w) && (t?.states ?? []).includes(w)
            ? `${w}=${t?.stateValues?.[w] ?? w}`
            : w,
      );
    const coreCond = words.join(' ');
    const flags = condition(ctx, key, coreCond);
    const unsettable = /\(not settable: (.*)\)$/.exec(flags);
    if (unsettable)
      return {
        // (Core's attribute words in one order, so one condition is one row.)
        when: [
          ...words.filter(w => /^[a-z][\w-]*=/i.test(w)).sort(),
          ...words.filter(w => !/^[a-z][\w-]*=/i.test(w)),
        ].join(' '),
        state: null,
        notSettable: unsettable[1],
      };
    return {
      when: /--when (\S+)/.exec(flags)?.[1] ?? null,
      state: /--state (\S+)/.exec(flags)?.[1] ?? null,
    };
  };
  for (const [k, v] of shows) {
    const [when, state, property] = k.split('|');
    if (!own.has(k) && ruledOver(when, property)) continue;
    if (own.has(k) && overwritten(k)) continue;
    const ruleKey = own.has(k) ? k : `base||${property}`;
    const at = inside(when);
    const light = tokenChain(v.raw, at.theme.light);
    const dark = tokenChain(v.raw, at.theme.dark);
    /** @param {ModeTokens} a @param {ModeTokens} b */
    const changed = (a, b) => [
      ...light.filter(t => a.light[t] !== b.light[t]),
      ...dark.filter(t => a.dark[t] !== b.dark[t]),
    ];
    // Whether the part's own rule sets a token it reads (a part-scoped
    // dial), at rest or under this condition.
    const onPart = [...light, ...dark].some(t =>
      [when, 'base'].some(w => own.has(`${w}||${t}`)),
    );
    const mine = changed(at.theme, at.parent);
    /** @type {PartValue['via']} */
    const tokenVia = theme.tokenVia
      ? theme.tokenVia(mine[0], key, onPart)
      : onPart
        ? 'part'
        : 'token';
    /** @type {PartValue['source']} */
    let source = 'core';
    /** @type {PartValue['via']} */
    let via = light.length || dark.length ? 'token' : 'value';
    if (own.has(ruleKey) && own.get(ruleKey) === v.raw) {
      // A rule on the part: the theme's own, or the one it extends with
      // the tokens it reads changed inside the part.
      const inheritedRule = inherited.get(ruleKey) === v.raw;
      if (!inheritedRule)
        [source, via] = [
          'theme',
          // A token the part's rule sets, as the setting that wrote it.
          property.startsWith('--') && theme.tokenVia
            ? theme.tokenVia(property, key, true)
            : theme.propertyVia
              ? // A variant row with no rule of its own shows the rest rule:
                // ask with the condition of the rule the value comes from.
                ruleKey === k
                ? theme.propertyVia(property, key, when, state)
                : theme.propertyVia(property, key, 'base', '')
              : 'part',
        ];
      else if (mine.length) [source, via] = ['theme', tokenVia];
      else [source, via] = ['base', 'part'];
    } else if (mine.length) {
      [source, via] = ['theme', tokenVia];
    } else if (changed(at.parent, theme.coreTokens).length) {
      source = 'base';
      if (onPart) via = 'part';
    }
    const cond = condOf(when, state, own.has(k) ? property : null);
    const row = {
      property,
      ...cond,
      value:
        v.light === v.dark
          ? orNull(v.light)
          : {light: orNull(v.light), dark: orNull(v.dark)},
      expression: v.raw,
      tokens: light.join(' ') === dark.join(' ') ? light : {light, dark},
      source,
      via,
    };
    values.push(row);
    rawKey.set(row, {when, state, own: own.has(k)});
  }
  // What a rule's `@light` or `@dark` block sets: that mode's value of the
  // property under the rule's condition, with that mode's declaration and
  // tokens; a block with no row of its own (a state Core's map leaves out,
  // a property the part reads nowhere else) is a row of its own.
  for (const m of folded.modeSets) {
    const other = m.mode === 'light' ? 'dark' : 'light';
    const at = inside(m.when);
    const shown = orNull(resolveIn(m.value, at.theme[m.mode], m.mode));
    const chain = tokenChain(m.value, at.theme[m.mode]);
    const via = theme.propertyVia
      ? theme.propertyVia(m.property, key, m.when, m.state)
      : 'part';
    /** @param {any} x @param {'light' | 'dark'} mode */
    const half = (x, mode) =>
      x && typeof x === 'object' && !Array.isArray(x) ? x[mode] : x;
    /** @param {any} a @param {any} b */
    const pair = (a, b) =>
      JSON.stringify(a) === JSON.stringify(b)
        ? a
        : m.mode === 'light'
          ? {light: a, dark: b}
          : {light: b, dark: a};
    let target = values.find(v => {
      const r = rawKey.get(v);
      return (
        v.property === m.property &&
        r != null &&
        sameWhen(r.when, m.when) &&
        r.state === m.state
      );
    });
    if (!target) {
      // The other mode shows what the same condition shows without the
      // block: its own row, else the same variant at rest (Core's state
      // conditions are not rows of their own), else the part at rest.
      const cond = condOf(m.when, m.state, m.property);
      const base =
        values.find(
          v =>
            v.property === m.property &&
            v.when === cond.when &&
            v.state === cond.state,
        ) ??
        (cond.when != null
          ? values.find(
              v =>
                v.property === m.property &&
                v.when === cond.when &&
                v.state == null,
            )
          : undefined) ??
        values.find(
          v => v.property === m.property && v.when == null && v.state == null,
        );
      target = {
        property: m.property,
        ...cond,
        value: base ? half(base.value, other) : null,
        expression: base ? half(base.expression, other) : '',
        tokens: base ? half(base.tokens, other) : [],
        source: 'theme',
        via,
      };
      // (Filled in for this mode below, as for a row the block joins.)
      target.value = pair(null, target.value);
      target.expression = pair('', target.expression);
      target.tokens = pair([], target.tokens);
      values.push(target);
      rawKey.set(target, {when: m.when, state: m.state, own: true});
    }
    target.value = pair(shown, half(target.value, other));
    target.expression = pair(m.value, half(target.expression, other));
    target.tokens = pair(chain, half(target.tokens, other));
    target.source = 'theme';
    target.via = via;
  }
  // At rest first, then each variant, in the order the part reads them.
  values.sort((a, b) => Number(a.when != null) - Number(b.when != null));
  // A longhand Core writes beside its own shorthand, with the same value,
  // says nothing more (a button's four corner radii beside its radius).
  // One condition Core writes in two word orders reads as one row.
  const seenRows = new Set();
  // A condition a theme rule sets shows the rule's value, not Core's too.
  const ruled = new Set(
    values
      .filter(v => rawKey.get(v)?.own)
      .map(v => JSON.stringify([v.property, v.when, v.state])),
  );
  const unique = values.filter(v => {
    if (
      !rawKey.get(v)?.own &&
      ruled.has(JSON.stringify([v.property, v.when, v.state]))
    )
      return false;
    const id = JSON.stringify([
      v.property,
      v.when,
      v.state,
      v.value,
      v.expression,
    ]);
    if (seenRows.has(id)) return false;
    seenRows.add(id);
    return true;
  });
  const said = unique.filter(
    v =>
      !unique.some(
        o =>
          o !== v &&
          o.when === v.when &&
          o.state === v.state &&
          o.property !== v.property &&
          sets(o.property, v.property) &&
          !sets(v.property, o.property) &&
          JSON.stringify(o.value) === JSON.stringify(v.value) &&
          o.expression === v.expression,
      ),
  );
  return {
    type: 'themeEdit.showPart',
    data: {theme: name, kind: theme.kind, part: key, values: said},
  };
}

/**
 * A value with a var() still in it is no value: null.
 * @param {string} v
 */
const orNull = v => (/var\(/.test(v) ? null : v);

/**
 * A theme the project lists, by slug. A slug two packages provide is the
 * one the app records under that slug; with none recorded, it is refused,
 * naming the packages: `show` selects no package.
 * @param {string} cwd
 * @param {string} name
 */
async function findProjectTheme(cwd, name) {
  const {findTheme, readThemeListState} = await import('../theme/_adapter.mjs');
  try {
    return await findTheme(name, {cwd, includeLocal: true});
  } catch (e) {
    const err = /** @type {any} */ (e);
    if (err?.code !== ERROR_CODES.ERR_AMBIGUOUS_THEME) throw e;
    const recorded = (() => {
      try {
        return readThemeListState(cwd).themes[name] ?? null;
      } catch {
        return null;
      }
    })();
    if (recorded)
      return findTheme(name, {cwd, includeLocal: true, package: recorded});
    // Each package's `theme add`, which takes --package; once the app
    // records one, show reads that one.
    throw new AstryxError(
      `Theme "${name}" is provided by more than one package, and the app records none of them, so show cannot tell which one to read. Add the one you use to the app; show then reads it.`,
      err.suggestions ?? [
        {name: 'astryx theme list', reason: 'the packages that provide it'},
      ],
      ERROR_CODES.ERR_AMBIGUOUS_THEME,
    );
  }
}
