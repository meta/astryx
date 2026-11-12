// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The commands `how` suggests: written for the user's theme, quoted so
 * a shell runs them as printed, and each one checked as `set` checks it and
 * compiled, so an answer names only commands that are accepted and change
 * the theme. Nothing is written.
 * @position api/theme-edit — imported by _how.mjs and _how-question.mjs
 */

import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {checkSetting} from './_check.mjs';
import {baseResolved} from './_project.mjs';
import {
  compileTheme,
  editedThemes,
  keyOf,
  loadTheme,
  readHistory,
  themeFiles,
} from './_settings.mjs';
import {LIKE, P} from './_tables.mjs';
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';

/** The theme name commands use when the app has no theme yet. */
export const EXAMPLE_THEME = 'my-theme';

/**
 * One change a command makes.
 * @typedef {object} Step
 * @property {'set' | 'undo'} verb
 * @property {string} thing
 * @property {string} [value]
 * @property {string} [on]
 * @property {string} [when]
 * @property {string} [state]
 * @property {string} [mode]
 */

/**
 * The theme the commands of one answer are for, and the checks they pass.
 * @typedef {object} HowTheme
 * @property {string} slug
 * @property {boolean} exists - false when the app has no theme: the commands name {@link EXAMPLE_THEME} and the answer starts with `new`.
 * @property {string | null} previewDamage - why the in-app preview's record is damaged and how to fix it, or null.
 * @property {string[]} themes - Every theme the editor made in the app.
 * @property {string | null} note - Which theme the commands are for when the app has several, or that it has none.
 * @property {'named' | 'only' | 'last-changed' | 'none'} chosenBy - How the theme was picked.
 * @property {number} undoSteps - How many changes `undo` can step back.
 * @property {boolean} bodyFontReachesHeadings - Whether `font X --on body` also changes the heading font in this release.
 * @property {import('./_settings.mjs').ThemeData} data
 * @property {{light: Record<string, string>, dark: Record<string, string>}} base
 * @property {{light: Record<string, string>, dark: Record<string, string>}} [own] - The theme's own values: the base's with its settings applied.
 * @property {(steps: Step[]) => {ok: true} | {ok: false, why: string}} check
 */

/**
 * The theme's own token values in each mode: the base theme's, with the
 * theme's settings applied (a whole-theme corners setting, an exact
 * token), as `compile` builds them.
 * @param {any} compiled
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @returns {{light: Record<string, string>, dark: Record<string, string>}}
 */
function ownTokens(compiled, base) {
  const out = {light: {...base.light}, dark: {...base.dark}};
  for (const [k, v] of Object.entries(compiled?.tokens ?? {})) {
    const pair = Array.isArray(v)
      ? v
      : v && typeof v === 'object'
        ? [/** @type {any} */ (v).light, /** @type {any} */ (v).dark]
        : [v, v];
    if (typeof pair[0] === 'string') out.light[k] = pair[0];
    if (typeof pair[1] === 'string') out.dark[k] = pair[1];
  }
  return out;
}

/**
 * The theme an answer's commands are for: the one named, the only one, or
 * the one changed last; with none, a theme the answer first makes.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} cwd
 * @param {string | undefined} name
 * @returns {Promise<HowTheme>}
 */
export async function howTheme(ctx, cwd, name) {
  const themes = editedThemes(cwd, 'changed');
  /** @type {import('./_settings.mjs').ThemeData | null} */
  let data = null;
  let slug = name ?? themes[0] ?? EXAMPLE_THEME;
  let note = null;
  if (name === '')
    throw new AstryxError(
      '--theme was given no name.',
      [{name: `${P} how --list kinds`, reason: 'or leave --theme out'}],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  if (name) data = loadTheme(cwd, name);
  else if (themes.length) {
    try {
      data = loadTheme(cwd, slug);
    } catch (e) {
      if (!(e instanceof AstryxError)) throw e;
      note = `${slug} cannot be read (${e.message}); the commands are checked against a new theme instead`;
    }
    if (themes.length > 1 && !note)
      note = `the commands are for ${slug}, the theme changed last; --theme picks another of: ${themes.join(', ')}`;
  } else
    note = `the app has no theme yet; the commands are for a theme named ${EXAMPLE_THEME}, made first with: ${P} new ${EXAMPLE_THEME} --like ${LIKE[0]}`;
  const exists = Boolean(data);
  if (!data) {
    if (!themes.length) slug = EXAMPLE_THEME;
    data = {name: slug, like: LIKE[0], mode: 'both', settings: []};
  }
  const theme = /** @type {import('./_settings.mjs').ThemeData} */ (data);
  const base = await baseResolved(ctx.project, theme.like);
  const compiled = (/** @type {import('./_settings.mjs').ThemeData} */ d) =>
    JSON.stringify([d.mode, compileTheme(ctx, d, base)]);
  const before = compiled(theme);
  // Whether a body font setting also moves the heading font: Core gives
  // headings the body family when a theme names no heading family, so it is
  // read from Core, and stays right when that changes.
  const {core} = ctx.project;
  /** @param {any} typography */
  const headingOf = typography => {
    try {
      return core.resolveThemeTokens(
        core.defineTheme({
          name: 'how-probe',
          ...(typography ? {typography} : {}),
        }),
        {mode: 'light'},
      )['--font-family-heading'];
    } catch {
      return null;
    }
  };
  const fontless = {
    ...theme,
    settings: theme.settings.filter(
      x => x.thing !== 'font' || x.on === 'heading',
    ),
  };
  const withBody = compileTheme(
    ctx,
    {
      ...fontless,
      settings: [
        ...fontless.settings,
        {thing: 'font', value: 'courier', on: 'body', source: 'dial'},
      ],
    },
    base,
  ).typography;
  // The editor writes the base theme's heading font beside a body font of
  // its own; only a build that writes none leaves headings to Core.
  const bodyFontReachesHeadings =
    !withBody?.heading &&
    headingOf(compileTheme(ctx, fontless, base).typography) !==
      headingOf(withBody);
  // A damaged preview record refuses every preview command, so an answer
  // names its fix instead of a preview command.
  const {previewRecordProblem} = await import('./_preview-app.mjs');
  return {
    slug,
    exists,
    themes,
    note,
    previewDamage: previewRecordProblem(cwd),
    chosenBy: name
      ? 'named'
      : !themes.length
        ? 'none'
        : themes.length === 1
          ? 'only'
          : 'last-changed',
    data: theme,
    base,
    own: ownTokens(compileTheme(ctx, theme, base), base),
    undoSteps: exists
      ? readHistory(themeFiles(cwd, slug).history).steps.length
      : 0,
    bodyFontReachesHeadings,
    check(steps) {
      /** @type {import('./_settings.mjs').ThemeData} */
      const d = JSON.parse(JSON.stringify(theme));
      // The checks set runs read the base theme's values (the corner rungs).
      const checkCtx = /** @type {any} */ ({...ctx, base});
      try {
        for (const st of steps) apply(checkCtx, slug, d, st);
        if (compiled(d) === before)
          return {
            ok: false,
            why: 'it changes nothing: the theme already looks that way',
          };
        return {ok: true};
      } catch (e) {
        if (e instanceof AstryxError)
          return {
            ok: false,
            why: e.message.replace(/ Nothing was changed\.$/, ''),
          };
        throw e;
      }
    },
  };
}

/**
 * Apply one step to theme data in memory, as `set` and `undo` do.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} d
 * @param {Step} st
 */
function apply(ctx, slug, d, st) {
  const unset = st.verb === 'undo';
  const s = checkSetting(
    ctx,
    slug,
    d,
    st.thing,
    st.value,
    {on: st.on, when: st.when, state: st.state, mode: st.mode},
    unset,
  );
  if (!unset && s.thing === 'mode') {
    d.mode = /** @type {'both' | 'light-only' | 'dark-only'} */ (s.value);
    return;
  }
  if (!unset && s.thing === 'base')
    throw new AstryxError(
      'how does not check a change of base',
      [],
      ERROR_CODES.ERR_INVALID_ARGUMENT,
    );
  const k = keyOf(s);
  const i = d.settings.findIndex(x => keyOf(x) === k);
  if (unset) {
    if (i < 0)
      throw new AstryxError(
        `the theme does not set ${st.thing}${st.on ? ` on ${st.on}` : ''}`,
        [],
        ERROR_CODES.ERR_THEME_NOT_SET,
      );
    d.settings.splice(i, 1);
  } else if (i >= 0) d.settings[i] = s;
  else d.settings.push(s);
}

/**
 * A step as the command a person runs.
 * @param {Step} st
 * @param {string} slug
 */
export function render(st, slug) {
  return [
    P,
    st.verb,
    slug,
    quoteCommandArgument(st.thing),
    ...(st.value != null ? [quoteCommandArgument(st.value)] : []),
    ...(st.on ? ['--on', st.on] : []),
    ...(st.when ? ['--when', st.when] : []),
    ...(st.state ? ['--state', st.state] : []),
    ...(st.mode ? ['--mode', st.mode] : []),
  ].join(' ');
}

/**
 * Parse a dial example (`set my corners pill --on button`) into a step.
 * @param {string} example
 * @returns {Step | null}
 */
export function exampleStep(example) {
  const words = [...example.matchAll(/"((?:[^"\\]|\\.)*)"|(\S+)/g)].map(
    m => m[1] ?? m[2],
  );
  const [verb, , thing, ...rest] = words;
  if (verb !== 'set' || !thing) return null;
  /** @type {Step} */
  const st = {verb: 'set', thing};
  const flag = rest.findIndex(w => w.startsWith('--'));
  const value = (flag < 0 ? rest : rest.slice(0, flag)).join(' ');
  if (value) st.value = value;
  for (let i = flag < 0 ? rest.length : flag; i < rest.length; i += 2) {
    const k = rest[i].slice(2);
    if (k === 'on' || k === 'when' || k === 'state' || k === 'mode')
      st[k] = rest[i + 1];
  }
  return st;
}

/**
 * Keep the alternatives that pass, and render them for the theme.
 * @param {HowTheme} env
 * @param {Step[][]} options each a list of steps run in order
 * @returns {{commands: string[], refused: Array<{command: string, why: string}>}}
 */
export function checked(env, options) {
  /** @type {string[]} */
  const commands = [];
  /** @type {Array<{command: string, why: string}>} */
  const refused = [];
  for (const steps of options) {
    const text = steps.map(st => render(st, env.slug));
    const r = env.check(steps);
    if (r.ok) commands.push(...text.filter(c => !commands.includes(c)));
    else refused.push({command: text.join(' && '), why: r.why});
  }
  return {commands, refused};
}
