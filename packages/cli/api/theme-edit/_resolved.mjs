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
import {compileTheme, editedThemes, loadTheme} from './_settings.mjs';
import {
  mergeRules,
  ownTokens,
  partShows,
  partValues,
  scopedTokens,
} from './_how-commands.mjs';
import {FAMILIES, P} from './_tables.mjs';

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
 * @property {(property: string, part: string) => 'dial' | 'part'} [propertyVia] -
 *   for an editor theme: what writes a CSS property the theme's own rule on
 *   the part sets: a property setting on the part that covers it, else a
 *   dial (on the part or on the whole theme)
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
      propertyVia: (property, part) => {
        if (
          data.settings.some(
            st =>
              reaches(st, part) &&
              st.source === 'property' &&
              sets(String(st.thing), property),
          )
        )
          return 'part';
        return data.settings.some(
          st => st.source === 'dial' && (st.on == null || reaches(st, part)),
        )
          ? 'dial'
          : 'part';
      },
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
  const shows = partShows(
    ctx.C,
    {},
    {components: theme.components},
    theme.tokens,
    key,
  );
  const own = partValues(theme.components?.[key]);
  const inherited = partValues(theme.parentComponents?.[key]);
  const themeRules = mergeRules(theme.components?.[key] ?? {});
  const parentRules = mergeRules(theme.parentComponents?.[key] ?? {});
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
              ? theme.propertyVia(property, key)
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
    values.push({
      property,
      // Each condition as `set --when` takes it: `prop:value`, joined with +.
      when:
        when === 'base'
          ? null
          : when
              .split(' ')
              .map(w => w.replace('=', ':'))
              .join('+'),
      state: state || null,
      value:
        v.light === v.dark
          ? orNull(v.light)
          : {light: orNull(v.light), dark: orNull(v.dark)},
      expression: v.raw,
      tokens: light.join(' ') === dark.join(' ') ? light : {light, dark},
      source,
      via,
    });
  }
  // At rest first, then each variant, in the order the part reads them.
  values.sort((a, b) => Number(a.when != null) - Number(b.when != null));
  // A longhand Core writes beside its own shorthand, with the same value,
  // says nothing more (a button's four corner radii beside its radius).
  const said = values.filter(
    v =>
      !values.some(
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
