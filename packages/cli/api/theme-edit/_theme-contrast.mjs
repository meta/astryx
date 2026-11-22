// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The text contrast a theme's own color tokens give, measured as the
 * theme editor's check measures a setting, for a theme however it was
 * written (a hand-written theme.ts included).
 * @input A project folder and a defined or built theme object.
 * @output Problems, each with a plain fix: the token, where, the mode and a
 * value that reads. Component rules the theme writes are what the tokens
 * are measured over, not measured themselves.
 * @position api/theme-edit — read by `theme build` and `doctor`.
 */

/**
 * Text as plain ASCII, as the CLI prints: a sample the census read from a
 * page ("Delete item…") keeps its words.
 * @param {string} text
 * @returns {string}
 */
function plainAscii(text) {
  return text
    .replace(/[\u2014\u2013]/g, '-')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/\u2026/g, '...')
    .replace(/\u2192/g, '->')
    .replace(/\u00a0/g, ' ')
    .replace(/[^\x20-\x7e]/g, '?');
}

/**
 * A fix line of the editor's check as plain words: the token or property,
 * the part and block it is set on, the mode and the value. Null for any
 * other line.
 * @param {string | null | undefined} fix
 * @returns {string | null}
 */
export function plainFix(fix) {
  const m =
    /\bset \S+ (\S+) '([^']+)'((?: --(?:on|when|state|mode) \S+| --only)*)$/.exec(
      String(fix ?? ''),
    );
  if (!m) return null;
  const [, thing, value, flags] = m;
  /** @param {string} name */
  const flag = name => new RegExp(`--${name} (\\S+)`).exec(flags)?.[1];
  const on = flag('on');
  // (The overlays are the editor's group for the popover family: a theme
  // file sets it on the popover, which a menu's surface is.)
  const part = on === 'overlays' ? 'popover' : on;
  // (A block of a part is its variant and its state, joined as a theme
  // file writes the key: 'variant:secondary+hover'.)
  const block = [flag('when'), flag('state')].filter(Boolean).join('+');
  const mode = flag('mode');
  const where = part
    ? `in components['${part}']${block ? `['${block}']` : ''}`
    : 'in tokens';
  return `set ${thing} to ${value} ${where}${mode ? ` for ${mode} mode` : ''}`;
}

/**
 * The text contrast problems a theme's color tokens give with its part rules:
 * each token the theme sets is measured as an editor setting, over Core's
 * own tokens and the theme's components. A problem the components give with
 * Core's own tokens is not the theme's tokens' to report. A project whose
 * part census cannot be read gives none.
 * @param {string} cwd
 * @param {{name: string, tokens?: Record<string, unknown>, components?: Record<string, any>, __onDark?: {tokens?: Record<string, unknown>}}} theme
 * @returns {Promise<Array<{text: string, fix: string | null}> | null>}
 */
export async function themeTokenContrast(cwd, theme) {
  const {context} = await import('./_context.mjs');
  const {contrastProblems, themeResolved} = await import('./_settings.mjs');
  const ctx = await context(cwd);
  if (ctx.unchecked) return null;
  const {themeBase} = await import('./_project.mjs');
  // (Core's own tokens, under the theme's own part rules: what a setting of
  // the theme's tokens is measured over.)
  const own = themeBase(ctx.project, theme);
  const base = {
    ...themeBase(
      ctx.project,
      ctx.project.core.defineTheme({name: 'astryx-defaults'}),
    ),
    components: own.components,
    onDark: own.onDark,
  };
  const settings = Object.entries(theme.tokens ?? {})
    .filter(([thing, v]) => /^--color-/.test(thing) && v != null)
    .map(([thing, v]) => ({
      thing,
      value: Array.isArray(v) ? `light-dark(${v[0]}, ${v[1]})` : String(v),
      source: 'token',
    }));
  const res = themeResolved(ctx, theme.name, theme);
  const found = await contrastProblems(
    ctx,
    /** @type {any} */ ({name: theme.name, settings}),
    res,
    {base},
  );
  // (Texts one fix reads again are one line: the first text, and how many
  // more there are.)
  /** @type {Map<string, {text: string, fix: string | null, more: number}>} */
  const byFix = new Map();
  for (const p of found) {
    if (typeof p === 'string' || !/^text in /.test(p.text)) continue;
    const fix = plainFix(p.fix);
    const seen = byFix.get(fix ?? p.text);
    if (seen) seen.more++;
    else byFix.set(fix ?? p.text, {text: p.text, fix, more: 0});
  }
  return [...byFix.values()].map(({text, fix, more}) => ({
    text: plainAscii(
      more
        ? `${text} (and ${more} more text${more === 1 ? '' : 's'} the same fix reads)`
        : text,
    ),
    fix,
  }));
}

/**
 * The lines `theme build` and `doctor` show for a theme's token contrast.
 * They only warn, so nothing the measurement meets stops a build or a
 * doctor run: a project the editor cannot read, an old Core, a package the
 * editor needs that is not installed, or a token that is not text gives
 * null, nothing measured.
 * @param {string} cwd
 * @param {Parameters<typeof themeTokenContrast>[1]} theme
 * @returns {Promise<Array<{text: string, fix: string | null}> | null>}
 */
export async function tokenContrastWarnings(cwd, theme) {
  try {
    return await themeTokenContrast(cwd, theme);
  } catch {
    return null;
  }
}
