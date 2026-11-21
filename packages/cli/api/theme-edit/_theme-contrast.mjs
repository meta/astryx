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
 * A fix line of the editor's check as plain words: the token, the part it
 * is set on, the mode and the value. Null for any other line.
 * @param {string | null | undefined} fix
 * @returns {string | null}
 */
export function plainFix(fix) {
  const m =
    /\bset \S+ (--[\w-]+) '([^']+)'(?: --on ([\w-]+))?(?: --only)?(?: --mode (light|dark))?$/.exec(
      String(fix ?? ''),
    );
  if (!m) return null;
  const [, token, value, on, mode] = m;
  const where = on ? `in components['${on}']` : 'in tokens';
  return `set ${token} to ${value} ${where}${mode ? ` for ${mode} mode` : ''}`;
}

/**
 * The text contrast problems a theme's color tokens give with its part rules:
 * each token the theme sets is measured as an editor setting, over Core's
 * own tokens and the theme's components. A problem the components give with
 * Core's own tokens is not the theme's tokens' to report. A project whose
 * part census cannot be read gives none.
 * @param {string} cwd
 * @param {{name: string, tokens?: Record<string, unknown>, components?: Record<string, any>, __onDark?: {tokens?: Record<string, unknown>}}} theme
 * @returns {Promise<Array<{text: string, fix: string | null}>>}
 */
export async function themeTokenContrast(cwd, theme) {
  const {context} = await import('./_context.mjs');
  const {contrastProblems, themeResolved} = await import('./_settings.mjs');
  const ctx = await context(cwd);
  if (ctx.unchecked) return [];
  const {core} = ctx.project;
  const defaults = core.defineTheme({name: 'astryx-defaults'});
  const base = {
    light: core.resolveThemeTokens(defaults, {mode: 'light'}),
    dark: core.resolveThemeTokens(defaults, {mode: 'dark'}),
    components: theme.components ?? {},
    onDark: /** @type {Record<string, string>} */ (
      Object.fromEntries(
        Object.entries(theme.__onDark?.tokens ?? {}).filter(
          ([k, v]) => k.startsWith('--') && typeof v === 'string',
        ),
      )
    ),
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
  return found.flatMap(p =>
    typeof p !== 'string' && /^text in /.test(p.text)
      ? [{text: p.text, fix: plainFix(p.fix)}]
      : [],
  );
}

/**
 * The lines `theme build` and `doctor` show for a theme's token contrast.
 * They only warn, so nothing the measurement meets stops a build or a
 * doctor run: a project the editor cannot read, an old Core, a package the
 * editor needs that is not installed, or a token that is not text gives no
 * lines.
 * @param {string} cwd
 * @param {Parameters<typeof themeTokenContrast>[1]} theme
 * @returns {Promise<Array<{text: string, fix: string | null}>>}
 */
export async function tokenContrastWarnings(cwd, theme) {
  try {
    return await themeTokenContrast(cwd, theme);
  } catch {
    return [];
  }
}
