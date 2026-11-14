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
import {FAMILIES, GROUPS, LIKE, P} from './_tables.mjs';
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
 * @property {(steps: Step[], intent: MeasureIntent) => string | null} measure the measured check: why the built result does not do what the question asks, or null
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
    own: ownTokens(compileTheme(ctx, theme, base), base),
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
 * @property {boolean} [literal] a mode is named with lighter or darker: borders and the shared text color move as written
 * @property {'more' | 'less' | null} [shadowDir] the way a shadow's strength moves ("darker shadows": more)
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
      .replace(/var\(\s*(--[a-z0-9-]+)\s*(?:,\s*([^()]*))?\)/gi, (_, t, fb) =>
        String(map[t] ?? fb ?? ''),
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
  const tw = ownTokens(was, base);
  const tn = ownTokens(now, base);
  const C = ctx.C;
  /** @param {string} part */
  const members = part => FAMILIES[part] ?? [part];
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
    for (const g of Object.keys(GROUPS))
      for (const r of C.partReads(part, g) ?? [])
        if (mainWhen(r.when?.length ? r.when : ['']))
          for (const prop of r.props ?? []) {
            const key = `base||${prop}`;
            if (!raw.has(key)) raw.set(key, `var(${r.token})`);
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
                raw.set(key, own.get(`base||${prop}`) ?? `var(${r.token})`);
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
      if (
        intent.families.length &&
        !intent.families.includes(fam) &&
        !typedHere
      )
        return `it would also change ${part}'s ${prop}, which is not what the question asks to change`;
      for (const mode of /** @type {const} */ (['light', 'dark'])) {
        if (visible && mode !== visible) continue;
        const after = v[mode];
        const before = o?.[mode] ?? null;
        if (
          intent.zero &&
          ['radius', 'space', 'border', 'shadow'].includes(fam)
        ) {
          const n = measureNumber(after);
          if (!/^(none|transparent|0)$/.test(after) && n !== 0)
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
          const y = painted(before, tw[mode], mode);
          const want =
            mode === 'dark' &&
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
