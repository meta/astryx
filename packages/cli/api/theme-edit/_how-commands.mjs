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
import {checkSetting, indicatorLines, pillDrawnRadios} from './_check.mjs';
import {baseResolved} from './_project.mjs';
import {readThemeListState} from '../theme/_adapter.mjs';
import {
  compileTheme,
  editedThemes,
  keyOf,
  loadTheme,
  readHistory,
  themeFiles,
  groupsOf,
} from './_settings.mjs';
import {GROUPS, LIKE, P} from './_tables.mjs';
import {hexToOklch} from '../theme/palette/generate/color.mjs';
import {
  COLOR_IN_VALUE,
  alphaOf,
  colorsIn,
  parseColor,
  splitTop,
} from './_color.mjs';
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
 * @property {boolean} [only] the one member of a group, not the group
 * @property {boolean} [keeps] writes a look back as it shows it now (a
 *   status Core draws its own way): an except of that look never leaves
 *   it out, as it is what keeps the look
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
 * @property {(steps: Step[]) => {ok: true} | {ok: false, why: string, run?: string[]}} check
 * @property {(steps: Step[], part: string, prop: string) => {light: string, dark: string} | null} valueAfter what a part shows for a property at rest after the steps, in each mode, or null when it reads none
 * @property {(steps: Step[], intent: MeasureIntent) => string | null} measure the measured check: why the built result does not do what the question asks, or null
 */

/**
 * The theme's own token values in each mode: the base theme's, with the
 * theme's settings applied (a whole-theme corners setting, an exact
 * token), as `compile` builds them.
 * A type scale the theme writes (the text-size and type dials write one)
 * is expanded the way Core expands it, so a heading size reads as the
 * scale draws it, not as the base theme's.
 * @param {any} compiled
 * @param {{light: Record<string, string>, dark: Record<string, string>}} base
 * @param {any} [core] the project's Core module, which expands the scale
 * @returns {{light: Record<string, string>, dark: Record<string, string>}}
 */
function ownTokens(compiled, base, core) {
  const out = {light: {...base.light}, dark: {...base.dark}};
  const scale = compiled?.typography?.scale;
  if (
    scale &&
    typeof scale.base === 'number' &&
    typeof scale.ratio === 'number' &&
    typeof core?.expandTypeScale === 'function'
  ) {
    try {
      const expanded = core.expandTypeScale({
        base: scale.base,
        ratio: scale.ratio,
      });
      for (const [k, v] of Object.entries(expanded ?? {}))
        if (typeof v === 'string' && /^--font-size-|^--text-.*-size$/.test(k)) {
          out.light[k] = v;
          out.dark[k] = v;
        }
    } catch {
      // (A Core that cannot expand the scale leaves the base sizes.)
    }
  }
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
  }
  // With no editor theme, the theme the app shows now (its default, read
  // as `theme add` and doctor read it) is what the answer starts from and
  // measures against, when it is a base the editor can start from.
  const appDefault = (() => {
    try {
      const d = readThemeListState(cwd).defaultSlug;
      return d && LIKE.includes(d) ? d : null;
    } catch {
      return null;
    }
  })();
  const startLike = appDefault ?? LIKE[0];
  if (!name && !themes.length)
    note = `the app has no theme yet; the commands are for a theme named ${EXAMPLE_THEME}, made first with: ${P} new ${EXAMPLE_THEME} --like ${startLike}${appDefault ? ` (${appDefault} is the theme the app shows now)` : ''}`;
  const exists = Boolean(data);
  if (!data) {
    if (!themes.length) slug = EXAMPLE_THEME;
    data = {name: slug, like: startLike, mode: 'both', settings: []};
  }
  const theme = /** @type {import('./_settings.mjs').ThemeData} */ (data);
  const base = await baseResolved(ctx.project, theme.like);
  const compiled = (/** @type {import('./_settings.mjs').ThemeData} */ d) =>
    JSON.stringify([d.mode, compileTheme(ctx, d, base)]);
  const before = compiled(theme);
  /** @type {any} */
  let beforeCache = null;
  const beforeCompiled = () => (beforeCache ??= compileTheme(ctx, theme, base));
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
    own: ownTokens(compileTheme(ctx, theme, base), base, ctx.project?.core),
    undoSteps: exists
      ? readHistory(themeFiles(cwd, slug).history).steps.length
      : 0,
    bodyFontReachesHeadings,
    /**
     * The measured check: build the theme with the steps in memory (the
     * same compile `set` builds from; nothing is written), resolve every
     * value the touched parts show at rest and in the named state or
     * variant, in light and dark, before and after, and hold them to what
     * the question asks. Returns why it does not fit, or null.
     * @param {Step[]} steps
     * @param {MeasureIntent} intent
     * @returns {string | null}
     */
    measure(steps, intent) {
      const d = JSON.parse(JSON.stringify(theme));
      const checkCtx = /** @type {any} */ ({...ctx, base});
      try {
        for (const st of steps) apply(checkCtx, slug, d, st);
      } catch {
        return null; // check() says why
      }
      const was = beforeCompiled();
      const now = compileTheme(ctx, d, base);
      // A one-mode theme shows only that mode: only it is measured.
      const visible =
        d.mode === 'light-only'
          ? 'light'
          : d.mode === 'dark-only'
            ? 'dark'
            : null;
      return measureFit(ctx, base, was, now, intent, steps, visible);
    },
    /**
     * What a part shows for a property at rest after the steps (built in
     * memory, nothing written): its own rule, else what Core declares at
     * rest, every var() written out from the part's tokens.
     * @param {Step[]} steps
     * @param {string} part
     * @param {string} prop
     */
    valueAfter(steps, part, prop) {
      const d = JSON.parse(JSON.stringify(theme));
      const checkCtx = /** @type {any} */ ({...ctx, base});
      try {
        for (const st of steps) apply(checkCtx, slug, d, st);
      } catch {
        return null;
      }
      const now = compileTheme(ctx, d, base);
      const toks = ownTokens(now, base, ctx.project?.core);
      const camel = prop.replace(/-([a-z])/g, (_m, x) => x.toUpperCase());
      /** @type {Record<string, any>} */
      const rules = {
        ...(base.components?.[part]?.base ?? {}),
        ...(now.components?.[part]?.base ?? {}),
      };
      const at = ctx.C.MAP?.[part]?.at?.[prop] ?? {};
      const rest =
        Object.entries(/** @type {Record<string, string>} */ (at)).find(
          ([k]) =>
            !/[\s:]/.test(k) &&
            k
              .split(',')
              .every(x =>
                /^(?:variant=(?:default|primary|standard)|size=md|elevation=none|always)$|^$/.test(
                  x,
                ),
              ),
        )?.[1] ?? Object.values(at)[0];
      const raw = rules[camel] ?? rules[prop] ?? rest;
      if (raw == null) return null;
      /** @param {'light' | 'dark'} m */
      const scoped = m => {
        /** @type {Record<string, string>} */
        const t = {...toks[m]};
        for (const [k, v] of Object.entries(rules))
          if (k.startsWith('--') && typeof v === 'string') t[k] = v;
        return t;
      };
      // (A private variable Core sets nowhere at rest shows its fallback.)
      /** @param {'light' | 'dark'} m */
      const shown = m => {
        let v = String(raw);
        for (let i = 0; i < 4; i++)
          v = resolveIn(v, scoped(m), m).replace(
            /var\(\s*--_[\w-]+\s*,\s*((?:[^()]|\([^()]*\))*)\)/g,
            '$1',
          );
        return v.trim();
      };
      return {light: shown('light'), dark: shown('dark')};
    },
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
        if (e instanceof AstryxError) {
          // The command the refusal names to run instead, when it names
          // one ("set t text-size 18").
          const run = (e.suggestions ?? [])
            .filter(x => /^do this instead/.test(String(x.reason ?? '')))
            .map(x => String(x.name));
          return {
            ok: false,
            why: e.message.replace(/ Nothing was changed\.$/, ''),
            ...(run.length ? {run} : {}),
          };
        }
        throw e;
      }
    },
  };
}

/**
 * What the measured check holds a command to.
 * @typedef {object} MeasureIntent
 * @property {string[]} families the kinds of change asked for (color, radius, space, border, weight, opacity, shadow, fontsize); empty: any
 * @property {'more' | 'less' | null} dir the way a size moves
 * @property {boolean | null} lighter the way a color moves
 * @property {'more' | 'less' | null} opacityDir the way an opacity moves
 * @property {boolean} zero a removal: the changed values reach none or 0
 * @property {string[]} subjects the parts the question changes
 * @property {string[]} keep the parts it excepts, compares against or forbids changing
 * @property {string[]} typed values the question gives (taken as given)
 * @property {'light' | 'dark' | null} [mode] the mode the question names
 * @property {boolean} [bound] the question gives a bound ("smaller than 24px"): a space is checked against it too
 * @property {boolean} [contrast] the words ask about contrast ("too light to read"): text in dark mode moves the other way
 * @property {string[]} [than] parts the question compares against ("darker than the page"): a color moves past theirs
 * @property {string} [from] a theme color the way is taken from ("the accent color but lighter"): a color moves that way from it, not from the part's own
 * @property {'more' | 'less'} [saturation] the colors asked more or less saturated ("more colorful", "more muted")
 * @property {boolean} [literal] a mode is named with lighter or darker: borders and the shared text color move as written
 * @property {'more' | 'less' | null} [shadowDir] the way a shadow's strength moves ("darker shadows": more)
 * @property {boolean} [fainter] the question makes something fainter, less visible or more see-through ("less visible", "half as visible", "more transparent"): no border, outline, ring or shadow gets stronger anywhere
 */

/** A camelCase property as CSS writes it. @param {string} k */
const kebab = k => k.replace(/[A-Z]/g, m => `-${m.toLowerCase()}`);

/**
 * Every value of a compiled part, by `when|state|prop`.
 * @param {any} comp the part's compiled styles
 * @returns {Map<string, string>}
 */
function partValues(comp) {
  /** @type {Map<string, string>} */
  const out = new Map();
  for (const [when, rules] of Object.entries(comp ?? {}))
    for (const [k, v] of Object.entries(/** @type {any} */ (rules) ?? {}))
      if (v && typeof v === 'object')
        for (const [k2, v2] of Object.entries(v))
          out.set(`${when}|${k}|${kebab(k2)}`, String(v2));
      else out.set(`${when}||${kebab(k)}`, String(v));
  // A plain color written as `background` paints the background color.
  for (const [k, v] of [...out])
    if (/\|background$/.test(k) && !/gradient|url\(/.test(v)) {
      const bc = k.replace(/background$/, 'background-color');
      if (!out.has(bc)) out.set(bc, v);
    }
  return out;
}

/**
 * A value with every var() written out from a mode's tokens, and
 * light-dark() taken for that mode.
 * @param {string} v
 * @param {Record<string, string>} map
 * @param {'light' | 'dark'} mode
 */
function resolveIn(v, map, mode) {
  let out = String(v ?? '');
  for (let i = 0; i < 8; i++) {
    const next = out
      // (A variable with no value here and no fallback stays as written:
      // a value read in part is no value, never the rest of it.)
      .replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*))?\)/gi, (m, t, fb) =>
        String(map[t] ?? fb ?? m),
      )
      .replace(
        /light-dark\(\s*([^,()]+(?:\([^()]*\))?)\s*,\s*([^()]+(?:\([^()]*\))?)\s*\)/gi,
        (_, a, b) => (mode === 'light' ? a : b),
      );
    if (next === out) break;
    out = next;
  }
  return out.trim().toLowerCase();
}

/** The family of a CSS property or token, as the step check names them. @param {string} prop */
function familyOf(prop) {
  if (/radius/.test(prop)) return 'radius';
  if (/^--shadow-|^box-shadow$/.test(prop)) return 'shadow';
  if (/^opacity$/.test(prop)) return 'opacity';
  if (/weight/.test(prop)) return 'weight';
  if (/^(font-size|--font-size-[a-z0-9]+|--text-[a-z0-9-]+-size)$/.test(prop))
    return 'fontsize';
  if (
    /^(border(-[a-z]+)?-width|border(-(top|bottom|left|right|block|inline))?$|--border-width|--focus-outline-width|outline-width)$/.test(
      prop,
    )
  )
    return 'border';
  if (/colou?r|^background(-image)?$|^fill$|^stroke$|^filter$/.test(prop))
    return 'color';
  if (
    /^(padding|gap|margin|min-height|height|width|max-width|min-width|--spacing-|--size-)/.test(
      prop,
    )
  )
    return 'space';
  return null;
}

/** A length as px (rem/em at 16), or a plain number, or null. @param {string} v */
function measureNumber(v) {
  const m = /^(-?\d*\.?\d+)(px|rem|em)?$/.exec(
    String(v).trim().split(/\s+/)[0],
  );
  return m ? Number(m[1]) * (m[2] === 'rem' || m[2] === 'em' ? 16 : 1) : null;
}

/**
 * Whether a color steps for contrast in dark mode (a border; text when the
 * words ask about contrast): there "darker" asks for more contrast, so it
 * moves lighter, and "lighter" darker; a fill moves the same way in both
 * modes.
 * @param {string} name a token or a property
 * @param {boolean} [contrast] the words ask about contrast
 * @param {boolean} [literal] a mode is named with lighter or darker
 */
const isForeground = (name, contrast = false, literal = false) =>
  !/background|surface|fill|accent|overlay/.test(name) &&
  // Borders and the shared text tokens step by contrast with the page (how
  // answers "lighter text" and "darker borders" that way), unless a mode is
  // named; a part's own color steps as written.
  ((!literal && /border|outline/.test(name)) ||
    (!literal && /^--color-text-/.test(name)) ||
    (contrast && /text|^color$|on-/.test(name)));

/**
 * How strong a shadow reads: the sum of its colors' alphas; 0 for none.
 * @param {string} v
 */
function shadowStrength(v) {
  if (!v || /^none$/.test(v.trim())) return 0;
  // Each layer's color, read by the one color reader (hex with alpha,
  // rgba(), hsla(), `/ alpha`). A layer has lengths: a bare color is no
  // shadow.
  return splitTop(v, ',')
    .filter(layer => /(?:^|\s)-?\d*\.?\d+(?:px|rem|em)?(?=\s|$)/.test(layer))
    .reduce(
      (sum, layer) => sum + colorsIn(layer).reduce((n, c) => n + alphaOf(c), 0),
      0,
    );
}

/** The line properties the way of a line is measured on. */
const LINE_PROPS =
  /^(?:border(?:-(?:top|right|bottom|left))?-width|outline-width|box-shadow)$/;

/**
 * A line's strength as it renders: a width in px, or a shadow's summed
 * alpha.
 * @param {string} prop
 * @param {string} v resolved value
 */
function lineStrength(prop, v) {
  const x = String(v ?? '').trim();
  if (!x || /^(?:none|hidden|0|0px|initial|unset)$/.test(x)) return 0;
  if (prop === 'box-shadow') return shadowStrength(x);
  if (/\b(?:none|hidden)\b/.test(x)) return 0;
  const kw = /\b(thin|medium|thick)\b/.exec(x)?.[1];
  if (kw) return {thin: 1, medium: 3, thick: 5}[kw] ?? 1;
  const m = /(-?\d*\.?\d+)(px|rem|em)?/.exec(x);
  if (!m) return 0;
  return Number(m[1]) * (m[2] === 'rem' || m[2] === 'em' ? 16 : 1);
}

/**
 * The value a compiled theme gives one look of a part (a render Core
 * draws, `variant=default,size=md :focus-within`): its most specific rule
 * that matches, in that state, with the custom properties those rules set.
 * @param {any} compiled
 * @param {string} part
 * @param {string} render
 * @param {string} prop
 * @returns {{value: string | undefined, tokens: Record<string, string>}}
 */
function ruleValue(compiled, part, render, prop) {
  const rules = /** @type {Record<string, any>} */ (
    compiled?.components?.[part] ?? {}
  );
  const [head, ...rest] = String(render).split(' ');
  const attrs =
    head.startsWith(':') || head === 'always' ? [] : head.split(',');
  const state = (head.startsWith(':') ? [head, ...rest] : rest).join(' ');
  const matching = Object.keys(rules)
    .filter(
      w =>
        w === 'base' ||
        w.split(',').every(kv => attrs.includes(kv.replace(':', '='))),
    )
    .sort(
      (x, y) =>
        (x === 'base' ? 0 : x.split(',').length) -
        (y === 'base' ? 0 : y.split(',').length),
    );
  const camel = (/** @type {string} */ k) =>
    k.replace(/-([a-z])/g, (_m, c) => c.toUpperCase());
  /** @type {Record<string, string>} */
  const tokens = {};
  /** @type {string | undefined} */
  let value;
  const side = /^border-(top|right|bottom|left)-width$/.exec(prop)?.[1];
  for (const w of matching) {
    const layers = [rules[w], ...(state ? [rules[w]?.[state]] : [])];
    for (const r of layers) {
      if (!r || typeof r !== 'object') continue;
      for (const [k, v] of Object.entries(r))
        if (k.startsWith('--') && typeof v === 'string') tokens[k] = v;
      const own =
        r[camel(prop)] ??
        (side ? (r[camel(`border-${side}`)] ?? r.borderWidth) : undefined) ??
        (/^border(?:-[a-z]+)?-width$/.test(prop) ? r.border : undefined) ??
        (prop === 'outline-width' ? r.outline : undefined);
      if (typeof own === 'string' || typeof own === 'number')
        value = String(own);
    }
  }
  return {value, tokens};
}

/**
 * Why a step moves a line against the way asked, or null: every look Core
 * draws of each part the steps reach (a token step reaches every part that
 * reads the token), before and after, in each mode.
 * @param {any} C
 * @param {any} was
 * @param {any} now
 * @param {{light: Record<string, string>, dark: Record<string, string>}} tw
 * @param {{light: Record<string, string>, dark: Record<string, string>}} tn
 * @param {Step[]} steps
 * @param {MeasureIntent} intent
 * @param {'light' | 'dark' | null} visible
 * @returns {string | null}
 */
function lineWay(C, was, now, tw, tn, steps, intent, visible) {
  const fainter = Boolean(intent.fainter) || intent.zero;
  // (A dial set to a named look, "the buttons dial, outline", draws that
  // look's lines: a line it adds is the look asked.)
  const namedLook = steps.some(
    st =>
      !st.on &&
      !/^--/.test(String(st.thing)) &&
      !/^(?:more|less)$/.test(String(st.value ?? '')),
  );
  const changedTokens = new Set(
    [...new Set([...Object.keys(tw.light), ...Object.keys(tn.light)])].filter(
      t => tw.light[t] !== tn.light[t] || tw.dark[t] !== tn.dark[t],
    ),
  );
  /** @type {Set<string>} */
  const parts = new Set(
    steps
      .map(st => st.on)
      .filter(Boolean)
      .flatMap(x => groupsOf(null)[String(x)] ?? [String(x)]),
  );
  if (changedTokens.size)
    for (const [part, info] of Object.entries(C.MAP ?? {}))
      for (const [prop, byRender] of Object.entries(
        /** @type {any} */ (info)?.at ?? {},
      ))
        if (
          LINE_PROPS.test(prop) &&
          Object.values(/** @type {Record<string, string>} */ (byRender)).some(
            v =>
              [...String(v).matchAll(/var\(\s*(--[a-z0-9-]+)/g)].some(m =>
                changedTokens.has(m[1]),
              ),
          )
        )
          parts.add(part);
  for (const part of parts) {
    const at = /** @type {Record<string, Record<string, string>>} */ (
      C.MAP?.[part]?.at ?? {}
    );
    // Every look Core draws of the part; a part that draws no line at all
    // has one plain look with none.
    const renders = new Set(
      Object.values(at)
        .flatMap(x => Object.keys(x ?? {}))
        .filter(r => !/::/.test(r)),
    );
    if (!renders.size) renders.add('always');
    const props = new Set([
      ...Object.keys(at).filter(p => LINE_PROPS.test(p)),
      'border-top-width',
      'box-shadow',
    ]);
    for (const prop of props)
      for (const render of renders) {
        // (A look in a state Core writes nothing new for shows its plain
        // look's value: a popover's shadow while focused.)
        const head = render.startsWith(':') ? 'always' : render.split(' ')[0];
        const coreOf = (/** @type {string} */ pr) =>
          at[pr]?.[render] ?? at[pr]?.[head] ?? at[pr]?.always;
        const core =
          coreOf(prop) ??
          (prop === 'border-top-width' ? coreOf('border-width') : undefined);
        const a = ruleValue(was, part, render, prop);
        const b = ruleValue(now, part, render, prop);
        const rawA = a.value ?? core ?? '0';
        const rawB = b.value ?? core ?? '0';
        if (
          rawA === rawB &&
          JSON.stringify(a.tokens) === JSON.stringify(b.tokens) &&
          !/var\(/.test(rawA)
        )
          continue;
        // (A border whose style is none or hidden draws nothing, whatever
        // its width.)
        const styled = (/** @type {any} */ c, /** @type {string} */ raw) => {
          if (prop === 'box-shadow' || prop.startsWith('outline')) return true;
          const side =
            /^border-(top|right|bottom|left)-width$/.exec(prop)?.[1] ?? '';
          const st =
            ruleValue(
              c,
              part,
              render,
              side ? `border-${side}-style` : 'border-style',
            ).value ??
            /\b(?:solid|dashed|dotted|double|groove|ridge|inset|outset|none|hidden)\b/.exec(
              raw,
            )?.[0] ??
            coreOf(side ? `border-${side}-style` : 'border-style') ??
            coreOf('border-style');
          // (A border with no style is none: CSS's initial style.)
          if (/^(?:none|hidden)$/.test(String(st ?? 'none').trim()))
            return false;
          // (A transparent border draws nothing either.)
          const colorProp = side ? `border-${side}-color` : 'border-color';
          const col =
            ruleValue(c, part, render, colorProp).value ??
            coreOf(colorProp) ??
            coreOf('border-color') ??
            '';
          return !/^\s*transparent\s*$/.test(
            resolveIn(String(col), {...tw.light}, 'light'),
          );
        };
        const drawnA = styled(was, rawA);
        const drawnB = styled(now, rawB);
        for (const mode of /** @type {const} */ (['light', 'dark'])) {
          if (visible && mode !== visible) continue;
          const x = !drawnA
            ? 0
            : lineStrength(
                prop,
                resolveIn(rawA, {...tw[mode], ...a.tokens}, mode),
              );
          const y = !drawnB
            ? 0
            : lineStrength(
                prop,
                resolveIn(rawB, {...tn[mode], ...b.tokens}, mode),
              );
          const look = render === 'always' ? '' : ` (${render})`;
          const what =
            prop === 'box-shadow' ? 'shadow' : prop.replace(/-width$/, '');
          // (A removal keeps what an except pins in a state, and a group's
          // state look that drew nothing may take a fainter line: only the
          // looks at rest are held to an added line; a stronger one is
          // held everywhere.)
          const atRest = !/(?:^|\s):/.test(render);
          if (fainter && y > x + 1e-6 && (atRest || (intent.fainter && x > 0)))
            return `it would ${x ? 'strengthen' : 'add'} a ${what} on ${part}${look} in ${mode} mode, which the question makes fainter`;
          // (A shadow asked stronger may be new on a look that drew none.)
          if (
            !fainter &&
            !namedLook &&
            prop !== 'box-shadow' &&
            x === 0 &&
            y > 0 &&
            b.value !== undefined
          )
            return `it would add a ${what} on ${part}${look} in ${mode} mode, where Core draws none`;
        }
      }
  }
  return null;
}

/**
 * A shadow as it renders: each color written in one form (hex with its
 * alpha), so two spellings of the same shadow compare equal.
 * @param {string} v
 */
function shadowLook(v) {
  return String(v)
    .replace(COLOR_IN_VALUE, c => {
      const rgb = parseColor(c);
      if (!rgb) return c;
      const a = Math.round(alphaOf(c) * 255);
      return `rgb(${rgb.slice(0, 3).join(' ')} / ${a})`;
    })
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A color as it paints over the page in a mode: its alpha blended with the
 * page color, so a see-through fill compares by what shows.
 * @param {string} v
 * @param {Record<string, string>} toks the mode's tokens
 * @param {'light' | 'dark'} mode
 * @returns {number[] | null}
 */
function painted(v, toks, mode) {
  const rgb = parseColor(v);
  if (!rgb) return null;
  const a = alphaOf(v);
  const page =
    parseColor(resolveIn('var(--color-background-body)', toks, mode)) ??
    (mode === 'dark' ? [0, 0, 0] : [255, 255, 255]);
  return rgb.slice(0, 3).map((x, i) => x * a + page[i] * (1 - a));
}

/**
 * How colorful a color looks: its OKLCH chroma, the measure the palette
 * generator's vibrancy moves, or null when it does not read. (HSL
 * saturation rates a pale yellow near full and a deeper, more colorful one
 * lower.)
 * @param {string | number[] | null} v a color, or its RGB
 */
function saturationOf(v) {
  const rgb = Array.isArray(v) ? v : v == null ? null : parseColor(v);
  if (!rgb) return null;
  const hexOf = rgb
    .slice(0, 3)
    .map(x =>
      Math.round(Math.max(0, Math.min(255, x)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('');
  return hexToOklch(`#${hexOf}`).C;
}

/** The chroma change, per color, too small to count as a move. */
const CHROMA_STEP = 0.005;

/** @param {number[]} c */
const luminance = c => c[0] * 0.299 + c[1] * 0.587 + c[2] * 0.114;

/**
 * Hold the after build to the intent; why it does not fit, or null.
 * @param {any} ctx
 * @param {any} base
 * @param {any} was
 * @param {any} now
 * @param {MeasureIntent} intent
 * @param {Step[]} steps
 * @param {'light' | 'dark' | null} [visible] the one mode a one-mode theme shows
 */
function measureFit(ctx, base, was, now, intent, steps, visible = null) {
  const tw = ownTokens(was, base, ctx.project?.core);
  const tn = ownTokens(now, base, ctx.project?.core);
  const C = ctx.C;
  /** @param {string} part */
  const members = part => groupsOf(ctx)[part] ?? [part];
  // A kept part, or one state or variant of it (`part@when|state|`).
  /** @type {Array<{part: string, prefix: string}>} */
  const keeps = intent.keep.flatMap(k => {
    const [part, prefix = ''] = k.split('@');
    return members(part).map(m => ({part: m, prefix}));
  });
  const subjects = new Set(intent.subjects.flatMap(members));
  /**
   * The values a part shows, by `when|state|prop` and mode: its own
   * compiled rules, then each token it reads for a property.
   * @param {any} compiled
   * @param {{light: Record<string, string>, dark: Record<string, string>}} toks
   * @param {string} part
   */
  const shown = (compiled, toks, part) => {
    // Each rule of the part: the base theme's own declarations with the
    // theme's on top, condition by condition (a theme rule that sets one
    // property keeps the base rule's others).
    /** @type {Record<string, Record<string, any>>} */
    const rules = {};
    for (const src of [
      base.components?.[part] ?? {},
      compiled.components?.[part] ?? {},
    ])
      for (const [when, rule] of Object.entries(src))
        rules[when] =
          rule && typeof rule === 'object' && !Array.isArray(rule)
            ? {...(rules[when] ?? {}), ...rule}
            : rule;
    const own = partValues(rules);
    // A token the part's own rule sets (a part-scoped dial's --spacing-4)
    // is the value inside the part.
    // A token a variant's rule sets holds in that variant, over the part's.
    const scoped = (
      /** @type {'light' | 'dark'} */ m,
      /** @type {string} */ when,
    ) => {
      /** @type {Record<string, string>} */
      const t = {...toks[m]};
      for (const w of when === 'base' ? ['base'] : ['base', when])
        for (const [k, v] of Object.entries(rules[w] ?? {}))
          if (k.startsWith('--') && typeof v === 'string') t[k] = v;
      return t;
    };
    /** @type {Map<string, string>} */
    const raw = new Map(own);
    // The part at rest in its main variant is its `base` too (a set with no
    // --when writes base).
    const mainWhen = (/** @type {string[]} */ ws) =>
      ws.some(
        w =>
          w === '' ||
          /^variant=(default|primary|accent|neutral)$|^size=md$/.test(w),
      );
    // What Core writes for a property in a rule (a card's padding is its
    // container padding less the border width): the whole declaration, so
    // a value is never read from one token of several.
    const declOf = (
      /** @type {string} */ prop,
      /** @type {string} */ w,
      /** @type {string} */ token,
    ) => {
      const at = C.MAP[part]?.at?.[prop] ?? {};
      const attrs = w ? w.split(' ') : [];
      const key = Object.keys(at).find(k =>
        attrs.every(x => k.split(',').includes(x)),
      );
      // (Only a declaration of several theme tokens: one token alone is
      // read as that token.)
      const decl = key ? String(at[key]) : '';
      const tokens = new Set(
        [...decl.matchAll(/var\(\s*(--[a-z][a-z0-9-]*)/g)]
          .map(m => m[1])
          .filter(t => !/^--(_|astryx-)/.test(t)),
      );
      return decl.includes(token) && tokens.size > 1 ? decl : `var(${token})`;
    };
    for (const g of Object.keys(GROUPS))
      for (const r of C.partReads(part, g) ?? [])
        if (mainWhen(r.when?.length ? r.when : ['']))
          for (const prop of r.props ?? []) {
            const key = `base||${prop}`;
            const w = (r.when?.length ? r.when : ['']).find(
              (/** @type {string} */ x) => mainWhen([x]),
            );
            if (!raw.has(key)) raw.set(key, declOf(prop, w ?? '', r.token));
          }
    for (const g of Object.keys(GROUPS))
      for (const r of C.partReads(part, g) ?? [])
        for (const prop of r.props ?? [])
          for (const w of r.when?.length ? r.when : [''])
            if (!/::|:active|:hover|:focus|:checked|:disabled/.test(w)) {
              const key = `${w ? w.replace('=', ':') : 'base'}||${prop}`;
              // A variant with no rule of its own takes the part's own base
              // rule over the token it reads.
              if (!raw.has(key))
                raw.set(
                  key,
                  own.get(`base||${prop}`) ?? declOf(prop, w, r.token),
                );
            }
    /** @type {Map<string, {light: string, dark: string, raw: string}>} */
    const out = new Map();
    for (const [k, v] of raw)
      out.set(k, {
        light: resolveIn(v, scoped('light', k.split('|')[0]), 'light'),
        dark: resolveIn(v, scoped('dark', k.split('|')[0]), 'dark'),
        raw: v,
      });
    return out;
  };
  // Parts the question keeps: every value they show is the same after.
  for (const {part, prefix} of keeps) {
    const a = shown(was, tw, part);
    const b = shown(now, tn, part);
    for (const [k, v] of b) {
      // A whole kept part: its plain look (base); a state or variant: that.
      // A whole kept part: every rule it shows at rest (its plain rule and
      // each variant's); a state or variant: that.
      // (At rest: the plain rule, or one variant's alone; a variant in a
      // selected or checked state is a state of it.)
      if (
        prefix
          ? !k.startsWith(prefix)
          : k.split('|')[1] || !/^(base|[a-z]+:[\w-]+)$/.test(k.split('|')[0])
      )
        continue;
      // A plain color written as `background` is the background color the
      // part painted before.
      const prop0 = k.split('|')[2] ?? '';
      const o =
        a.get(k) ??
        (/\|background$/.test(k) ? a.get(`${k}-color`) : undefined) ??
        // A custom property set on the part: what that token was before.
        (/^--/.test(prop0)
          ? {
              light: resolveIn(`var(${prop0})`, tw.light, 'light'),
              dark: resolveIn(`var(${prop0})`, tw.dark, 'dark'),
              raw: `var(${prop0})`,
            }
          : undefined);
      // (A state rule the part did not list before is not measured: what
      // it showed in that state is not known here.)
      if (!o && k.split('|')[1]) continue;
      // A value the part did not show before (a keep rule on a member that
      // reads none of it) is not a change it shows; a kept variant is held
      // exactly: a rule it did not have, other than none, is a change,
      // unless it is what the part showed at rest; a corner longhand under
      // a kept shorthand follows the shorthand.
      if (!o && (!prefix || /^(none|transparent|initial|unset)$/.test(v.raw)))
        continue;
      const inherited = a.get(`base||${k.split('|')[2]}`);
      if (
        !o &&
        inherited &&
        inherited.light === v.light &&
        inherited.dark === v.dark
      )
        continue;
      // A look kept with no rule of its own under its condition is held to
      // what the part drew under it before, in any of its looks (Core
      // writes the condition beside the variant and size): measured as
      // drawn, never as stored.
      const condOf = k.split('|')[0].replace(':', '=');
      const drawnUnder = (/** @type {string} */ x) =>
        [...a.entries()].find(([k2]) => {
          const [w2, st2, p2] = k2.split('|');
          return (
            !st2 &&
            p2 === x &&
            w2.replace(/:/g, '=').split(/[\s,]/).includes(condOf)
          );
        })?.[1];
      if (!o && k.split('|')[0] !== 'base' && !k.split('|')[1]) {
        const was = drawnUnder(prop0);
        if (was && was.light === v.light && was.dark === v.dark) continue;
        // (A type property the look never set draws what it inherits, the
        // body's: a pin of the body's value keeps it as it drew.)
        const BODY = /** @type {Record<string, string>} */ ({
          'font-weight': '--text-body-weight',
          'font-family': '--font-family-body',
          'font-size': '--text-body-size',
          'line-height': '--text-body-line-height',
        });
        const bodyTok = BODY[prop0];
        if (!was && !a.get(`base||${prop0}`) && bodyTok) {
          const inh = (/** @type {'light' | 'dark'} */ m) =>
            resolveIn(`var(${bodyTok})`, tw[m], m);
          const same = (/** @type {'light' | 'dark'} */ m) => {
            const x = String(inh(m) ?? '').trim();
            return x !== '' && !/^var\(/.test(x) && x === String(v[m]).trim();
          };
          if (same('light') && same('dark')) continue;
        }
      }
      // A border color on a look that draws no border (no width there, as
      // a date input's own box, whose field draws the line) shows nothing.
      if (!o && /^border(?:-(?:top|right|bottom|left))?-color$/.test(prop0)) {
        const when0 = k.split('|')[0];
        const width =
          b.get(`${when0}||border-width`) ?? b.get('base||border-width');
        if (
          !width ||
          (lineStrength('border-width', width.light) === 0 &&
            lineStrength('border-width', width.dark) === 0)
        )
          continue;
      }
      // A border shorthand written back on a kept look is held to the
      // longhands it showed before: its width and color, in each mode.
      if (!o && /^border(?:-(?:top|right|bottom|left))?$/.test(prop0)) {
        const when0 = k.split('|')[0];
        // (Read under that condition in any look of the part: Core writes
        // it with the variant and size beside it.)
        const underCond = drawnUnder;
        const long = (/** @type {string} */ x) =>
          a.get(`${when0}||${prop0}-${x}`) ??
          a.get(`${when0}||border-${x}`) ??
          underCond(`${prop0}-${x}`) ??
          underCond(`border-${x}`) ??
          a.get(`base||${prop0}-${x}`) ??
          a.get(`base||border-${x}`);
        const w0 = long('width');
        const c0 = long('color');
        const same = (/** @type {'light' | 'dark'} */ m) => {
          const parts = splitTop(v[m], ' ').filter(Boolean);
          const w = parts.find(x =>
            /^-?\d*\.?\d+(?:px|rem|em)?$|^(?:thin|medium|thick)$/.test(x),
          );
          const c = parts
            .filter(
              x =>
                x !== w &&
                !/^(?:solid|dashed|dotted|double|none|hidden)$/.test(x),
            )
            .join(' ');
          return (
            w0 != null &&
            c0 != null &&
            lineStrength('border-width', w ?? '') ===
              lineStrength('border-width', w0[m]) &&
            c === c0[m]
          );
        };
        // (The same width and the same color token, written as Core
        // writes them, draw the same: the token takes the value its scope
        // gives it under the condition.)
        const rawParts = splitTop(String(v.raw ?? ''), ' ').filter(Boolean);
        const widthOf = (/** @type {'light' | 'dark'} */ m) =>
          splitTop(v[m], ' ').find(x =>
            /^-?\d*\.?\d+(?:px|rem|em)?$|^(?:thin|medium|thick)$/.test(x),
          ) ?? '';
        const sameRaw =
          w0 != null &&
          c0?.raw != null &&
          ['light', 'dark'].every(
            m =>
              lineStrength('border-width', widthOf(/** @type {any} */ (m))) ===
              lineStrength(
                'border-width',
                w0[/** @type {'light' | 'dark'} */ (m)],
              ),
          ) &&
          rawParts.includes(String(c0.raw).trim());
        if (sameRaw || (same('light') && same('dark'))) continue;
      }
      if (!o)
        return `it would change ${part} (${k.split('|').filter(Boolean).join(' ')}), which the question keeps as it is`;
      if (
        /radius$/.test(k) &&
        /-(start|end)-(start|end)-radius$/.test(k) &&
        b.has('base||border-radius')
      )
        continue;
      // A padding side under a kept padding shorthand follows the shorthand
      // (the part's own padding covers every side).
      if (/\|padding-/.test(k)) {
        const sh = b.get('base||padding');
        const was = a.get('base||padding');
        if (sh && was && sh.light === was.light && sh.dark === was.dark)
          continue;
      }
      if (o.light !== v.light || o.dark !== v.dark)
        return `it would change ${part} (${k.split('|').filter(Boolean).join(' ')}), which the question keeps as it is`;
    }
  }
  // The way of a line, in every look Core draws: an ask that makes
  // something fainter, or removes it, never adds or strengthens a border,
  // outline, ring or shadow anywhere; a way asked of a line or a shadow
  // never adds one to a look that drew none (a card variant with no
  // border, a table row whose cells draw the dividers).
  const lineAsk =
    Boolean(intent.fainter) ||
    intent.zero ||
    (Boolean(intent.dir) &&
      intent.families.some(f => f === 'border' || f === 'shadow'));
  if (lineAsk) {
    const why = lineWay(C, was, now, tw, tn, steps, intent, visible);
    if (why) return why;
  }
  const typed = new Set(intent.typed.map(x => x.toLowerCase()));
  // A shadow ask is answered only by a shadow that looks different: an
  // opaque color written with alpha ff, or clamped there, is no change.
  let shadowMoved = !intent.shadowDir;
  // A value the question types is the target: the way of what it writes
  // is as written, but the kind of change and a removal are still held,
  // and every other value is measured the way asked (a dial step beside a
  // typed value included: "smaller, 16px" never gives spacing more). A dial
  // is judged by what it does, never by its own word: "vibrancy less" is
  // the way "more washed out" asks.
  const typedFamilies = new Set(
    steps
      .filter(st => typed.has(String(st.value ?? '').toLowerCase()))
      .map(st => familyOf(st.thing)),
  );
  // The subject's changed values: family, direction, removal.
  const touched = new Set([
    ...subjects,
    ...steps
      .map(st => st.on)
      .filter(Boolean)
      .flatMap(x => members(String(x))),
  ]);
  // A radio mark the editor keeps round on a Core that draws its circle
  // with the pill token, and its dot: a zero radius ask leaves them.
  const radios = new Set(
    pillDrawnRadios(C).flatMap(m => [m, ...(C.MAP[m]?.contains ?? [])]),
  );
  // An indicator line's thickness (a tab's underline height) is the
  // width of a line it draws, as a border's is.
  const lineSide = new Map(indicatorLines(C).map(x => [x.part, x.side]));
  for (const part of touched) {
    // A whole kept part is checked above, not as a subject.
    if (keeps.some(k => k.part === part && !k.prefix)) continue;
    const a = shown(was, tw, part);
    const b = shown(now, tn, part);
    for (const [k, v] of b) {
      // A kept state or variant of the part is checked above.
      if (
        keeps.some(x => x.part === part && x.prefix && k.startsWith(x.prefix))
      )
        continue;
      const prop = k.split('|')[2];
      // A shorthand written where the part read longhands: its first side.
      // (Whether the value before is the same rule's, not a stand-in.)
      const exact = a.has(k);
      const o =
        a.get(k) ??
        (prop === 'padding'
          ? (a.get(`${k.split('|')[0]}||padding-top`) ??
            a.get('base||padding-top'))
          : prop === 'border'
            ? a.get('base||border-width')
            : a.get(`base||${prop}`));
      if (o && o.light === v.light && o.dark === v.dark) continue;
      const fam = familyOf(prop);
      if (!fam) continue;
      // A property a typed value writes is asked: the question wrote it.
      const typedHere = steps.some(
        st =>
          typed.has(String(st.value ?? '').toLowerCase()) &&
          familyOf(st.thing) === fam,
      );
      // A property Core draws from the very token a step writes (a title's
      // margin from its heading size) moves with it: that token is asked.
      const sameToken = steps.some(
        st =>
          /^--/.test(String(st.thing)) &&
          Object.keys(GROUPS).some(g =>
            (C.partReads(part, g) ?? []).some(
              (/** @type {{token: string, props: string[]}} */ r) =>
                r.token === st.thing && r.props.includes(prop),
            ),
          ) &&
          steps.some(x => x.thing === st.thing && familyOf(x.thing) !== fam),
      );
      // An indicator line's thickness is also the width of a line it
      // draws: a border ask reaches it.
      const lineWidth =
        lineSide.get(part) === prop && intent.families.includes('border');
      if (
        intent.families.length &&
        !intent.families.includes(fam) &&
        !lineWidth &&
        !typedHere &&
        !sameToken
      )
        return `it would also change ${part}'s ${prop}, which is not what the question asks to change`;
      for (const mode of /** @type {const} */ (['light', 'dark'])) {
        if (visible && mode !== visible) continue;
        const after = v[mode];
        const before = o?.[mode] ?? null;
        if (intent.zero && fam === 'radius' && radios.has(part)) continue;
        if (
          intent.zero &&
          ['radius', 'space', 'border', 'shadow'].includes(fam)
        ) {
          // (Core's own composed layers, a card's ring, are no shadow of
          // the theme's: a shadow of only those is none at rest.)
          const own = splitTop(after, ',')
            .map(x => x.trim())
            .filter(
              x =>
                x &&
                !/^var\(\s*--_/.test(x) &&
                !/^(?:0(?:px)?\s+)+transparent$/i.test(x),
            )
            .join(', ');
          const n = measureNumber(own);
          if (own && !/^(none|transparent|0)$/.test(own) && n !== 0)
            return `${part}'s ${prop} would be ${after} in ${mode} mode, not none`;
          continue;
        }
        // A shadow written where the part showed none it can read is a
        // change.
        if (fam === 'shadow' && before == null && !/^none$/i.test(after))
          shadowMoved = true;
        if (before == null || typedFamilies.has(fam)) continue;
        // A shadow's strength moves the way asked, in each mode.
        if (fam === 'shadow' && intent.shadowDir) {
          const x = shadowStrength(after);
          const y = shadowStrength(before);
          if (Math.abs(x - y) > 1e-6 && (intent.shadowDir === 'more') !== x > y)
            return `${part}'s ${prop} would get ${intent.shadowDir === 'more' ? 'weaker' : 'stronger'} in ${mode} mode`;
          if (shadowLook(after) !== shadowLook(before)) shadowMoved = true;
          continue;
        }
        // "more transparent": the color's alpha goes down, "more opaque" up.
        if (fam === 'color' && intent.opacityDir) {
          const x = parseColor(after) ? alphaOf(after) : null;
          const y = parseColor(before) ? alphaOf(before) : null;
          if (
            x != null &&
            y != null &&
            Math.abs(x - y) > 1e-3 &&
            (intent.opacityDir === 'more') !== x > y
          )
            return `${part}'s ${prop} would get ${intent.opacityDir === 'more' ? 'more' : 'less'} see-through in ${mode} mode`;
        }
        if (fam === 'color' && intent.lighter != null) {
          // A part's color, in every variant and state it shows (a step on
          // the plain rule reaches the variants that take it), in each mode
          // (or the one the question names), never an overlay layer over
          // the fill; only the kind of color the steps write (a new fill
          // may bring a text color that reads on it).
          if (intent.mode && mode !== intent.mode) continue;
          const [when] = k.split('|');
          if (!exact) continue;
          const kindOf = (/** @type {string} */ x) =>
            /^background/.test(x)
              ? 'fill'
              : /border|outline/.test(x)
                ? 'line'
                : 'ink';
          if (
            !steps.some(
              st => kindOf(st.thing.replace(/^--color-/, '')) === kindOf(prop),
            )
          )
            continue;
          if (
            /overlay|tint/.test(String(o?.raw ?? '')) ||
            /overlay|tint/.test(v.raw)
          )
            continue;
          const x = painted(after, tn[mode], mode);
          const y = intent.from
            ? painted(
                resolveIn(`var(${intent.from})`, tw[mode], mode),
                tw[mode],
                mode,
              )
            : painted(before, tw[mode], mode);
          // (A way from a theme color is that color's way, in every mode.)
          const want =
            mode === 'dark' &&
            !intent.from &&
            isForeground(prop, intent.contrast, intent.literal)
              ? !intent.lighter
              : intent.lighter;
          if (x && y && Math.abs(luminance(x) - luminance(y)) >= 0.5)
            if (want !== luminance(x) > luminance(y))
              return `${part}'s ${prop}${when !== 'base' ? ` (${when})` : ''} would get ${want ? 'darker' : 'lighter'} in ${mode} mode (${before} to ${after})`;
          // "darker than the page": past the part compared against, in
          // each mode it shows.
          if (x && /^background/.test(prop))
            for (const ref of intent.than ?? []) {
              const refValue =
                ref === 'page'
                  ? resolveIn('var(--color-background-body)', tn[mode], mode)
                  : shown(now, tn, ref).get('base||background-color')?.[mode];
              const r = refValue ? painted(refValue, tn[mode], mode) : null;
              if (r && want !== luminance(x) > luminance(r))
                return `${part}'s ${prop}${when !== 'base' ? ` (${when})` : ''} would still be ${want ? 'darker' : 'lighter'} than the ${ref} in ${mode} mode (${after} on ${refValue})`;
            }
          continue;
        }
        const dir = fam === 'opacity' ? intent.opacityDir : intent.dir;
        if (
          !dir ||
          !(
            ['radius', 'border', 'weight', 'opacity', 'fontsize'].includes(
              fam,
            ) ||
            // A space: one length written over one read (never a shorthand).
            (fam === 'space' &&
              (intent.bound ||
                (exact &&
                  steps.some(st => st.thing === prop) &&
                  !/\s/.test(after) &&
                  !/\s/.test(String(before)))))
          )
        )
          continue;
        const x = measureNumber(after);
        const y = measureNumber(before);
        if (x != null && y != null && x !== y && (dir === 'more') !== x > y)
          return `${part}'s ${prop} would move the other way in ${mode} mode (${before} to ${after})`;
      }
    }
  }
  // Tokens the steps name (a dial: its main token): the same checks.
  const DIAL_TOKEN = /** @type {Record<string, string>} */ ({
    accent: '--color-accent',
    danger: '--color-error',
    success: '--color-success',
    warning: '--color-warning',
    info: '--color-info',
    neutral: '--color-neutral',
  });
  for (const st of steps) {
    const tok = /^--/.test(st.thing) ? st.thing : DIAL_TOKEN[st.thing];
    if (!tok || st.on) continue;
    const fam = familyOf(tok);
    if (!fam) continue;
    if (intent.families.length && !intent.families.includes(fam))
      return `${tok} is not what the question asks to change`;
    for (const mode of /** @type {const} */ (['light', 'dark'])) {
      if (visible && mode !== visible) continue;
      const after = resolveIn(`var(${tok})`, tn[mode], mode);
      const before = resolveIn(`var(${tok})`, tw[mode], mode);
      if (after === before) continue;
      if (
        intent.zero &&
        ['radius', 'space', 'border', 'shadow'].includes(fam)
      ) {
        const n = measureNumber(after);
        if (!/^(none|transparent|0)$/.test(after) && n !== 0)
          return `${tok} would be ${after} in ${mode} mode, not none`;
        continue;
      }
      if (typedFamilies.has(fam)) continue;
      if (fam === 'shadow' && intent.shadowDir) {
        const x = shadowStrength(after);
        const y = shadowStrength(before);
        if (Math.abs(x - y) > 1e-6 && (intent.shadowDir === 'more') !== x > y)
          return `${tok} would get ${intent.shadowDir === 'more' ? 'weaker' : 'stronger'} in ${mode} mode`;
        if (shadowLook(after) !== shadowLook(before)) shadowMoved = true;
        continue;
      }
      if (fam === 'color' && intent.opacityDir) {
        const x = parseColor(after) ? alphaOf(after) : null;
        const y = parseColor(before) ? alphaOf(before) : null;
        if (
          x != null &&
          y != null &&
          Math.abs(x - y) > 1e-3 &&
          (intent.opacityDir === 'more') !== x > y
        )
          return `${tok} would get ${intent.opacityDir === 'more' ? 'more' : 'less'} see-through in ${mode} mode`;
        continue;
      }
      if (fam === 'color' && intent.lighter != null) {
        if (intent.mode && mode !== intent.mode) continue;
        const x = painted(after, tn[mode], mode);
        const y = painted(before, tw[mode], mode);
        const want =
          mode === 'dark' && isForeground(tok, intent.contrast, intent.literal)
            ? !intent.lighter
            : intent.lighter;
        if (x && y && Math.abs(luminance(x) - luminance(y)) >= 0.5)
          if (want !== luminance(x) > luminance(y))
            return `${tok} would get ${want ? 'darker' : 'lighter'} in ${mode} mode (${before} to ${after})`;
        continue;
      }
      const dir = fam === 'opacity' ? intent.opacityDir : intent.dir;
      if (!dir) continue;
      const x = measureNumber(after);
      const y = measureNumber(before);
      if (x != null && y != null && x !== y && (dir === 'more') !== x > y)
        return `${tok} would move the other way in ${mode} mode (${before} to ${after})`;
    }
  }
  // "more colorful", "more muted": the accent colors the theme shows (the
  // accent and the text and icons drawn in it) move that way in saturation
  // together, in each mode shown (a step that dulls them is not more
  // colorful), and the accent wash, as it paints over the page, never moves
  // the other way (a faint wash made a solid fill is not less colorful).
  if (intent.saturation)
    for (const mode of /** @type {Array<'light' | 'dark'>} */ (
      visible ? [visible] : ['light', 'dark']
    )) {
      let x = 0;
      let y = 0;
      let n = 0;
      for (const tok of Object.keys(tw[mode])) {
        if (!/^--color-(?:text-|icon-)?accent$/.test(tok)) continue;
        // (As it paints over the page.)
        const a = saturationOf(
          painted(resolveIn(`var(${tok})`, tn[mode], mode), tn[mode], mode),
        );
        const b = saturationOf(
          painted(resolveIn(`var(${tok})`, tw[mode], mode), tw[mode], mode),
        );
        if (a == null || b == null) continue;
        x += a;
        y += b;
        n++;
      }
      if (
        n &&
        (intent.saturation === 'more'
          ? x < y - CHROMA_STEP * n
          : x > y + CHROMA_STEP * n)
      )
        return `the accent colors would get ${intent.saturation === 'more' ? 'duller' : 'more saturated'} in ${mode} mode`;
      const wash = (/** @type {Record<string, string>} */ t) =>
        t['--color-accent-muted'] == null
          ? null
          : saturationOf(
              painted(resolveIn('var(--color-accent-muted)', t, mode), t, mode),
            );
      const [wa, wb] = [wash(tn[mode]), wash(tw[mode])];
      if (
        wa != null &&
        wb != null &&
        (intent.saturation === 'more'
          ? wa < wb - CHROMA_STEP
          : wa > wb + CHROMA_STEP)
      )
        return `the accent wash (--color-accent-muted) would get ${intent.saturation === 'more' ? 'duller' : 'more saturated'} in ${mode} mode, as it paints over the page`;
    }
  if (!shadowMoved && steps.some(st => familyOf(st.thing) === 'shadow'))
    return 'the shadows would look the same as they do now (a shadow color at full strength gets no stronger; a bigger or blurrier shadow can)';
  return null;
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
    {on: st.on, when: st.when, state: st.state, mode: st.mode, only: st.only},
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
    ...(st.only ? ['--only'] : []),
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
 * @returns {{commands: string[], refused: Array<{command: string, why: string, run?: string[]}>}}
 */
export function checked(env, options) {
  /** @type {string[]} */
  const commands = [];
  /** @type {Array<{command: string, why: string, run?: string[]}>} */
  const refused = [];
  for (const steps of options) {
    const text = steps.map(st => render(st, env.slug));
    const r = env.check(steps);
    if (r.ok) commands.push(...text.filter(c => !commands.includes(c)));
    else
      refused.push({
        command: text.join(' && '),
        why: r.why,
        ...(r.run ? {run: r.run} : {}),
      });
  }
  return {commands, refused};
}
