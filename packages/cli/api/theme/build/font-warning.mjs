// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Font-loading warning helpers for `astryx theme build` (#5015).
 *
 * Nothing in the pipeline loads font files — defineTheme and the built CSS
 * only set `font-family` — so a theme that names a webfont renders in the
 * fallback typeface on every machine whose app never loads it, and no step
 * says so. These helpers close that gap at build time.
 *
 * `collectUnloadedFonts` inspects a resolved theme or serialized adaptation
 * value. Resolved values use `--font-family-*` tokens and component
 * `fontFamily` properties; serialized adaptation values may also retain their
 * typography role configs. It returns the families that
 * are neither CSS generics nor known preinstalled system fonts. Unrecognized
 * names are assumed to be webfonts on purpose: a missed warning hides the
 * bug, a spurious one costs a glance.
 *
 * @input A resolved theme or serialized adaptation value ({tokens, components,
 *   typography}).
 * @output Ordered, case-insensitively deduped family names, and the human
 *   help snippet (<link> pair + @font-face) printed after the install
 *   instructions.
 * @position Sits beside build.mjs (api/theme/build/). Pure functions, no IO
 *   beyond the CLI invocation the human help names (formatCliCommand), so the
 *   `--json` receipt and the human output share one source of truth.
 */
import {formatCliCommand} from '../../../foundation/env/package-manager.mjs';

// font-family values that never need loading: CSS generic families, the ui-*
// system keywords, and CSS-wide keywords that can appear in a token value.
const GENERIC_KEYWORDS = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'math',
  'emoji',
  'fangsong',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'inherit',
  'initial',
  'unset',
  'revert',
  'revert-layer',
]);

// Families a clean machine already has: the members of core's own default
// stacks (tokens.stylex.ts typographyDefaults) plus the classic web-safe
// macOS/Windows set. Deliberately short — an unknown family warns, and for a
// preinstalled rarity that is a one-line false alarm, not a broken theme.
const SYSTEM_FAMILIES = new Set([
  '-apple-system',
  'blinkmacsystemfont',
  'segoe ui',
  'segoe ui emoji',
  'segoe ui symbol',
  'roboto',
  'helvetica',
  'helvetica neue',
  'arial',
  'arial black',
  'sf mono',
  'sf pro',
  'sf pro text',
  'sf pro display',
  'monaco',
  'consolas',
  'menlo',
  'courier',
  'courier new',
  'georgia',
  'times',
  'times new roman',
  'verdana',
  'tahoma',
  'trebuchet ms',
  'impact',
  'palatino',
  'cambria',
  'calibri',
  'lucida grande',
  'lucida console',
  'gill sans',
  'brush script mt',
  'snell roundhand',
  'old english text mt',
  // Linux staples — the shipped themes' fallback stacks name these on
  // purpose (e.g. neutral's code stack ends in Liberation Mono).
  'liberation mono',
  'liberation sans',
  'liberation serif',
  'dejavu sans',
  'dejavu sans mono',
]);

/**
 * Split a CSS font-family value into clean family names. Complete `var()`
 * calls are stripped first — neither the reference nor its fallback
 * arguments are this theme's own family declarations (the referenced token
 * is checked in its own right) — then names are unquoted and
 * whitespace-collapsed, and any remaining function-shaped fragment is
 * dropped. The unquoted branch of the tokenizer cannot start at whitespace
 * or a quote, so a quoted name is always taken whole even mid-list (commas
 * inside quotes stay inside the name).
 *
 * @param {string} value
 * @returns {string[]}
 */
function splitFamilies(value) {
  const families = [];
  const withoutVars = value.replace(/var\([^()]*(?:\([^()]*\)[^()]*)*\)/g, '');
  for (const segment of withoutVars.match(/"[^"]*"|'[^']*'|[^,"'\s][^,]*/g) ??
    []) {
    let name = segment.trim();
    if (!name) continue;
    // /s: a quoted name may span lines (template-literal theme sources).
    const quoted = /^(["']).*\1$/s.test(name);
    if (quoted) name = name.slice(1, -1);
    name = name.trim().replace(/\s+/g, ' ');
    if (!name || (!quoted && /[()]/.test(name))) continue;
    families.push(name);
  }
  return families;
}

/**
 * Collect the font families a resolved theme names but does not load —
 * every `--font-family-*` token plus every component-override `fontFamily`,
 * minus generics, CSS-wide keywords, `var()` references, and known system
 * families. Source order, first-seen casing, deduped case-insensitively.
 *
 * @param {{tokens?: Record<string, string>, components?: object, typography?: {body?: {family?: string, fallbacks?: string}, heading?: {family?: string, fallbacks?: string}, code?: {family?: string, fallbacks?: string}}}} resolvedTheme
 * @returns {string[]}
 */
export function collectUnloadedFonts(resolvedTheme) {
  const seen = new Set();
  /** @type {string[]} */
  const unloaded = [];

  /** @param {unknown} value */
  const consider = value => {
    if (typeof value !== 'string') return;
    for (const family of splitFamilies(value)) {
      const key = family.toLowerCase();
      if (GENERIC_KEYWORDS.has(key) || SYSTEM_FAMILIES.has(key)) continue;
      if (seen.has(key)) continue;
      seen.add(key);
      unloaded.push(family);
    }
  };

  for (const [token, value] of Object.entries(resolvedTheme?.tokens ?? {})) {
    if (token.startsWith('--font-family-')) consider(value);
  }

  // Built modules retain normalized adaptation intent instead of resolved rule
  // layers. Those rule values still carry authored role families here. A
  // fallback without a family is inert in core's buildFontFamily().
  const body = resolvedTheme?.typography?.body;
  if (body?.family) {
    consider(body.family);
    consider(body.fallbacks);
  }
  const heading = resolvedTheme?.typography?.heading;
  if (heading?.family) {
    consider(heading.family);
    consider(heading.fallbacks);
  }
  const code = resolvedTheme?.typography?.code;
  if (code?.family) {
    consider(code.family);
    consider(code.fallbacks);
  }

  // Component overrides are plain CSS maps of unknown depth (style keys,
  // nested at-rule blocks) — walk them and pick up every fontFamily.
  /** @param {unknown} node */
  const walk = node => {
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node)) {
      if (key === 'fontFamily') consider(value);
      else walk(value);
    }
  };
  walk(resolvedTheme?.components);

  return unloaded;
}

/**
 * Render the human fix printed after the install instructions: which fonts
 * the theme names but does not load, the Google Fonts `<link>` recipe, and
 * the self-hosted `@font-face` alternative.
 *
 * @param {string} themeName
 * @param {string[]} families
 * @returns {string}
 */
export function formatFontLoadingHelp(themeName, families) {
  const named = families.map(f => `"${f}"`).join(', ');
  return `
[note] Theme "${themeName}" names fonts it does not load: ${named}
${fontLoadingRecipe(families)}`;
}

/**
 * The same fix once for a batch build: each family the built themes name but
 * do not load, with the themes that name it, then one recipe for all of them.
 *
 * @param {Array<{family: string, themes: string[]}>} entries
 * @returns {string}
 */
export function formatBatchFontLoadingHelp(entries) {
  const named = entries
    .map(({family, themes}) => `  "${family}" (${themes.join(', ')})`)
    .join('\n');
  return `
[note] The built themes name fonts they do not load:
${named}
${fontLoadingRecipe(entries.map(entry => entry.family))}`;
}

/**
 * @param {string[]} families
 * @returns {string}
 */
function fontLoadingRecipe(families) {
  const cssHref =
    'https://fonts.googleapis.com/css2?' +
    families
      .map(f => `family=${encodeURIComponent(f).replace(/%20/g, '+')}`)
      .join('&') +
    '&display=swap';
  const first = families[0];
  const slug = first.toLowerCase().replace(/ /g, '-');
  return `  The built CSS only sets font-family; load these in your app, or every
  browser quietly falls back.

  Google Fonts (add :wght@... axes as your theme's weights require):

    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link rel="stylesheet" href="${cssHref}" />

  Self-hosted (repeat per family and weight):

    @font-face {
      font-family: ${JSON.stringify(first)};
      src: url('/fonts/${slug}.woff2') format('woff2');
      font-display: swap;
    }

  Recipe and fallback-stack guidance: ${formatCliCommand('docs typography')}
`;
}
