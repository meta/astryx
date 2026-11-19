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
import {ownTokens, partShows, partValues} from './_how-commands.mjs';
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
 * @property {(token: string) => 'token' | 'dial'} [tokenVia] - for an editor
 *   theme: whether an exact token setting or a dial writes a token
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
    const exact = new Set(
      data.settings.filter(s => s.source === 'token').map(s => String(s.thing)),
    );
    return {
      kind: 'editor',
      tokens: ownTokens(compiled, base, core),
      components: mergeComponents(base.components, compiled.components ?? {}),
      parentTokens: {light: base.light, dark: base.dark},
      parentComponents: base.components ?? {},
      tokenVia: token => (exact.has(token) ? 'token' : 'dial'),
    };
  }
  const {findTheme} = await import('../theme/_adapter.mjs');
  const found = await findTheme(name, {
    cwd,
    includeLocal: true,
    command: `${P} show`,
  });
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
  for (const src of [under ?? {}, over ?? {}])
    for (const [part, rules] of Object.entries(src)) {
      const into = (out[part] ??= {});
      for (const [when, rule] of Object.entries(rules ?? {}))
        into[when] =
          rule && typeof rule === 'object' && !Array.isArray(rule)
            ? {...(into[when] ?? {}), ...rule}
            : rule;
    }
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
    const light = tokenChain(v.raw, theme.tokens.light);
    const dark = tokenChain(v.raw, theme.tokens.dark);
    /** @type {PartValue['source']} */
    let source = 'core';
    /** @type {PartValue['via']} */
    let via = 'value';
    if (own.has(ruleKey) && own.get(ruleKey) === v.raw) {
      via = 'part';
      source = inherited.get(ruleKey) === v.raw ? 'base' : 'theme';
    } else if (light.length || dark.length) {
      const first = light[0] ?? dark[0];
      via = 'token';
      const differs = (
        /** @type {ModeTokens} */ a,
        /** @type {ModeTokens} */ b,
      ) =>
        light.some(t => a.light[t] !== b.light[t]) ||
        dark.some(t => a.dark[t] !== b.dark[t]);
      if (differs(theme.tokens, theme.parentTokens)) {
        source = 'theme';
        if (theme.tokenVia) via = theme.tokenVia(first);
      } else if (differs(theme.parentTokens, coreTokensOf(ctx))) {
        source = 'base';
      }
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

/** @type {WeakMap<object, ModeTokens>} */
const coreTokens = new WeakMap();

/**
 * Core's default tokens in each mode, for the project's Core.
 * @param {any} ctx
 * @returns {ModeTokens}
 */
function coreTokensOf(ctx) {
  const {core} = ctx.project;
  let t = coreTokens.get(core);
  if (!t) {
    const d = core.defineTheme({name: 'astryx-defaults'});
    t = {
      light: core.resolveThemeTokens(d, {mode: 'light'}),
      dark: core.resolveThemeTokens(d, {mode: 'dark'}),
    };
    coreTokens.set(core, t);
  }
  return t;
}
