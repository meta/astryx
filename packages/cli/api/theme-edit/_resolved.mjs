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
  ownThemeInput,
  readSavedStates,
  refuseOwnTokens,
  refuseThemeSource,
  sourceChangedReason,
  staleBuild,
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
 * @property {(property: string, part: string, when: string, state: string) => {when: string | null, state: string | null, exact: boolean} | null} [settingAt] - The property setting that wrote the theme's rule on the part under a rule key (`when|state` as the build writes them), as `set` took it.
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
 * Whether a stale build is one another CLI or base-theme release made from
 * the same settings (the two release reasons of the editor's stale check).
 * @param {string} why the reason `staleBuild` gives
 */
const releaseStale = why =>
  /^it was built by CLI |^@astryxdesign\/theme-\S+ is \S+ now, and the build was made on /.test(
    why,
  );

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
    // (Each saved state in the part's own spelling, which `settingAt`
    // matches rules by.)
    readSavedStates(ctx, data);
    /** @param {import('./_settings.mjs').ThemeData['settings'][number]} st @param {string} part */
    const reaches = (st, part) =>
      st.on == null
        ? false
        : st.on === part || (FAMILIES[st.on] ?? []).includes(part);
    // A rule the theme writes on a part comes from a property setting on
    // it, matched by the rule key the build writes for that setting (its
    // `--when` and `--state` placed the way the build places them).
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
    const stale = staleBuild(cwd, name, data);
    /** @type {{light: Record<string, string>, dark: Record<string, string>}} */
    let tokens;
    /** @type {Record<string, any>} */
    let components;
    if (stale && releaseStale(stale)) {
      // A build another CLI or base-theme release made: what the saved
      // settings make, as before (its hand additions are not read yet).
      const compiled = compileTheme(ctx, data, base);
      tokens = ownTokens(compiled, base, core);
      components = mergeComponents(base.components, compiled.components ?? {});
    } else {
      // What the app draws: the theme file as a build loads it, with what
      // a person adds by hand below the settings. A file that does not
      // parse or load, or no longer extends its settings, is refused, as
      // `set` refuses it.
      await refuseThemeSource(cwd, name);
      // Its own token values, judged as a build judges them.
      await refuseOwnTokens(ctx, name, data);
      // A theme file changed by hand since the build is what this reads;
      // any other stale build (a file missing or damaged, settings that no
      // longer match, a generated file edited by hand, a command stopped
      // part way) is refused: `show` builds it again.
      if (stale && stale !== sourceChangedReason(name))
        throw new AstryxError(
          `The ${name} theme's build is not current (${stale}), so what it draws cannot be read yet. Build it again with show first.`,
          [
            {
              name: `${P} show ${name}`,
              reason: 'builds the theme from its settings',
            },
          ],
          ERROR_CODES.ERR_THEME_INVALID,
        );
      const loaded = await ownThemeInput(ctx, name, data.like ?? null);
      if (!loaded?.theme) {
        const rel = `themes/${name}/${name}.theme.ts`;
        throw new AstryxError(
          `The ${name} theme does not load${loaded?.error ? `: ${loaded.error.message}` : ''}. Fix ${rel}, or put back what was changed by hand.`,
          [{name: `astryx theme build ${rel} --check`, reason: 'see why'}],
          ERROR_CODES.ERR_THEME_INVALID,
        );
      }
      tokens = {
        light: core.resolveThemeTokens(loaded.theme, {mode: 'light'}),
        dark: core.resolveThemeTokens(loaded.theme, {mode: 'dark'}),
      };
      components = loaded.theme.components ?? {};
    }
    return {
      kind: 'editor',
      tokens,
      components,
      parentTokens: {light: base.light, dark: base.dark},
      parentComponents: base.components ?? {},
      coreTokens: {light: coreDefaults.light, dark: coreDefaults.dark},
      settingAt,
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
  const inside = when => {
    /**
     * A mode's tokens with what the rules' `@light` or `@dark` blocks set
     * for that mode on the part, at rest and under this condition.
     * @param {Record<string, string>} map
     * @param {typeof folded.modeSets} sets
     * @param {'light' | 'dark'} mode
     */
    const withBlocks = (map, sets, mode) => {
      const out = {...map};
      for (const w of ['base', when])
        for (const m of sets)
          if (
            m.mode === mode &&
            !m.state &&
            m.property.startsWith('--') &&
            sameWhen(m.when, w)
          )
            out[m.property] = m.value;
      return out;
    };
    const tl = scopedTokens(themeRules, theme.tokens.light, when);
    const td = scopedTokens(themeRules, theme.tokens.dark, when);
    const pl = scopedTokens(parentRules, theme.parentTokens.light, when);
    const pd = scopedTokens(parentRules, theme.parentTokens.dark, when);
    return {
      theme: {
        light: withBlocks(tl, folded.modeSets, 'light'),
        dark: withBlocks(td, folded.modeSets, 'dark'),
      },
      parent: {
        light: withBlocks(pl, parentFolded.modeSets, 'light'),
        dark: withBlocks(pd, parentFolded.modeSets, 'dark'),
      },
    };
  };
  /**
   * Whether a mode block is the theme's own: not taken unchanged from the
   * theme it extends.
   * @param {(typeof folded.modeSets)[number]} m
   */
  const ownBlock = m =>
    !parentFolded.modeSets.some(
      p =>
        p.mode === m.mode &&
        p.property === m.property &&
        p.state === m.state &&
        p.value === m.value &&
        sameWhen(p.when, m.when),
    );
  /**
   * The tokens the theme's own mode blocks set inside the part under a
   * condition: the ones a value there reads in that mode (a block at rest,
   * or under the same condition, with no state).
   * @param {string} when
   * @param {boolean} [any] the theme's and the base's blocks alike
   */
  const blockTokensAt = (when, any = false) =>
    new Set(
      folded.modeSets
        .filter(
          m =>
            m.property.startsWith('--') &&
            !m.state &&
            ['base', when].some(w => sameWhen(m.when, w)) &&
            (any || ownBlock(m)),
        )
        .map(m => m.property),
    );
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
    const mine = changed(at.theme, at.parent);
    /** @type {PartValue['source']} */
    let source = 'core';
    if (own.has(ruleKey) && own.get(ruleKey) === v.raw) {
      // A rule on the part: the theme's own, or the one it extends with
      // the tokens it reads changed inside the part.
      const inheritedRule = inherited.get(ruleKey) === v.raw;
      if (!inheritedRule) source = 'theme';
      else source = mine.length ? 'theme' : 'base';
    } else if (mine.length) {
      source = 'theme';
    } else if (changed(at.parent, theme.coreTokens).length) {
      source = 'base';
    }
    // A value that reads a token a mode block sets on the part is the
    // theme's, through that token.
    const blockTokens = blockTokensAt(when);
    if ([...light, ...dark].some(t => blockTokens.has(t))) source = 'theme';
    const cond = condOf(when, state, own.has(k) ? property : null);
    const row = {
      property,
      ...cond,
      value: pairOf(
        .../** @type {[string, string]} */ (
          [...light, ...dark].some(t => blockTokensAt(when, true).has(t))
            ? [
                resolveIn(v.raw, at.theme.light, 'light'),
                resolveIn(v.raw, at.theme.dark, 'dark'),
              ]
            : [v.light, v.dark]
        ),
      ),
      expression: v.raw,
      tokens: light.join(' ') === dark.join(' ') ? light : {light, dark},
      source,
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
    /** @param {any} x @param {'light' | 'dark'} mode */
    const half = (x, mode) =>
      x && typeof x === 'object' && !Array.isArray(x) ? x[mode] : x;
    /** @param {any} a @param {any} b */
    const pair = (a, b) =>
      JSON.stringify(a) === JSON.stringify(b)
        ? a
        : // (A mode with nothing under it is left out: not shown yet.)
          Object.fromEntries(
            /** @type {[string, any][]} */ (
              m.mode === 'light'
                ? [
                    ['light', a],
                    ['dark', b],
                  ]
                : [
                    ['light', b],
                    ['dark', a],
                  ]
            ).filter(([, x]) => x !== undefined),
          );
    let alone = false;
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
      alone = !base;
      target = {
        property: m.property,
        ...cond,
        value: base ? half(base.value, other) : null,
        expression: base ? half(base.expression, other) : '',
        tokens: base ? half(base.tokens, other) : [],
        source: 'theme',
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
    // (A row of its own with nothing else under its condition: the other
    // mode is not shown yet, so it is left out, not given as no value.)
    if (alone) {
      target.value = /** @type {any} */ ({[m.mode]: shown});
      target.expression = /** @type {any} */ ({[m.mode]: m.value});
      target.tokens = /** @type {any} */ ({[m.mode]: chain});
    }
    // (A block the theme takes as it is from the theme it extends is the
    // base's.)
    const inherited = !ownBlock(m);
    target.source = inherited ? 'base' : 'theme';
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
 * A value in each mode, one value when the modes agree; a value with a
 * var() still in it is no value.
 * @param {string} light
 * @param {string} dark
 */
const pairOf = (light, dark) =>
  light === dark ? orNull(light) : {light: orNull(light), dark: orNull(dark)};

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
