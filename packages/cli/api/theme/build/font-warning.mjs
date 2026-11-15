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
import {cssUnescape} from '../../../foundation/text/css-escape.mjs';
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

/**
 * The fonts the systems ship, by the platform that ships them, as their
 * own font lists name them, by lowercase name: `everywhere` for a family
 * macOS and Windows both ship (a theme may name it as its font), else the
 * one platform that has it. The one table: the build's font notice, the
 * editor's "ships only on" notes and its install lines all read it. A
 * family both a system ships and Fontsource publishes (Roboto, Cascadia
 * Code) stays where the editor's open-font table names its package.
 */
export const SYSTEM_FONTS_BY_PLATFORM = {
  everywhere: [
    'helvetica',
    'arial',
    'arial black',
    'courier',
    'courier new',
    'georgia',
    'times',
    'times new roman',
    'verdana',
    'tahoma',
    'trebuchet ms',
    'impact',
    'comic sans ms',
  ],
  macOS: [
    'arial narrow',
    'andale mono',
    '-apple-system',
    'blinkmacsystemfont',
    'helvetica neue',
    'apple color emoji',
    'monaco',
    'menlo',
    'palatino',
    'lucida grande',
    'gill sans',
    'snell roundhand',
    'avenir',
    'avenir next',
    'avenir next condensed',
    'optima',
    'futura',
    'geneva',
    'didot',
    'baskerville',
    'big caslon',
    'bodoni 72',
    'hoefler text',
    'iowan old style',
    'american typewriter',
    'cochin',
    'copperplate',
    'athelas',
    'seravek',
    'skia',
    'superclarendon',
    'rockwell',
    'marker felt',
    'noteworthy',
    'chalkboard',
    'chalkboard se',
    'chalkduster',
    'apple chancery',
    'zapfino',
    'papyrus',
    'herculanum',
    'phosphate',
    'trattatello',
    'arial rounded mt bold',
    'pingfang sc',
    'pingfang tc',
    'pingfang hk',
    'hiragino sans',
    'hiragino sans gb',
    'hiragino kaku gothic pron',
    'hiragino mincho pron',
    'apple sd gothic neo',
  ],
  Windows: [
    'segoe ui',
    'segoe ui emoji',
    'segoe ui symbol',
    'segoe ui historic',
    // The weights Windows ships as families of their own.
    'segoe ui light',
    'segoe ui semilight',
    'segoe ui semibold',
    'segoe ui black',
    'segoe ui variable',
    'segoe ui variable display',
    'segoe ui variable text',
    'segoe ui variable small',
    'segoe print',
    'segoe script',
    'segoe fluent icons',
    'segoe mdl2 assets',
    'consolas',
    'cambria',
    'cambria math',
    'calibri',
    'calibri light',
    'candara',
    'corbel',
    'constantia',
    'bahnschrift',
    'sitka',
    'sitka text',
    'sitka small',
    'sitka heading',
    'sitka display',
    'sitka banner',
    'sitka subheading',
    'franklin gothic medium',
    'gabriola',
    'ebrima',
    'gadugi',
    'ink free',
    'javanese text',
    'leelawadee ui',
    'lucida console',
    'lucida sans unicode',
    'microsoft sans serif',
    'mv boli',
    'myanmar text',
    'nirmala ui',
    'palatino linotype',
    'sylfaen',
    'symbol',
    'webdings',
    'wingdings',
    'marlett',
    'brush script mt',
    'old english text mt',
    'microsoft yahei',
    'microsoft yahei ui',
    'microsoft jhenghei',
    'microsoft jhenghei ui',
    'simsun',
    'simhei',
    'nsimsun',
    'meiryo',
    'yu gothic',
    'yu mincho',
    'ms gothic',
    'ms mincho',
    'malgun gothic',
    // The same Windows fonts by their Chinese names.
    '微软雅黑',
    '宋体',
    '黑体',
  ],
  'Android and ChromeOS': ['roboto', 'noto color emoji'],
  // Linux staples — the shipped themes' fallback stacks name these on
  // purpose (e.g. neutral's code stack ends in Liberation Mono).
  Linux: [
    'liberation mono',
    'liberation sans',
    'liberation serif',
    'dejavu sans',
    'dejavu sans mono',
  ],
};

/**
 * Apple's own interface faces, by lowercase name, with the generic family
 * that reaches each. Apple systems hide them from a lookup by family name,
 * so a page reaches them only through these generics: by name, every
 * system shows the next font in the stack. No package loads them.
 */
export const APPLE_FACE_GENERICS = /** @type {Record<string, string>} */ ({
  'sf pro': 'system-ui',
  'sf pro text': 'system-ui',
  'sf pro display': 'system-ui',
  'sf pro rounded': 'ui-rounded',
  'sf compact': 'system-ui',
  'sf compact text': 'system-ui',
  'sf compact display': 'system-ui',
  'sf compact rounded': 'ui-rounded',
  'sf mono': 'ui-monospace',
  'new york': 'ui-serif',
});

/**
 * The generic family that reaches one of Apple's interface faces, or null
 * for any other family.
 * @param {string} family without quotes
 * @returns {string | null}
 */
export function appleFaceGeneric(family) {
  return (
    APPLE_FACE_GENERICS[family.trim().replace(/\s+/g, ' ').toLowerCase()] ??
    null
  );
}

/**
 * Every family a system ships, by lowercase name, and Apple's interface
 * faces: nothing loads those either, and no install line applies to them.
 */
const SYSTEM_FAMILIES = new Set([
  ...Object.values(SYSTEM_FONTS_BY_PLATFORM).flat(),
  ...Object.keys(APPLE_FACE_GENERICS),
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
    // The name as CSS reads it (`Gill\ Sans` is Gill Sans).
    name = cssUnescape(name).trim().replace(/\s+/g, ' ');
    if (!name || (!quoted && /[()]/.test(name))) continue;
    families.push(name);
  }
  return families;
}

/**
 * The system families the build counts as loaded (the one list), lower
 * case: what a typed family is checked against for a typo.
 * @returns {string[]}
 */
export function systemFontFamilies() {
  return [...SYSTEM_FAMILIES];
}

/**
 * The font families a CSS font-family value names, without generics,
 * CSS-wide keywords or `var()` references (system families included).
 * @param {string} value
 * @returns {string[]}
 */
export function namedFontFamilies(value) {
  return splitFamilies(value).filter(
    family => !GENERIC_KEYWORDS.has(family.toLowerCase()),
  );
}

/**
 * The family list of a CSS `font` shorthand: what follows its size (and
 * line height), as the shorthand's grammar puts it last. A system font
 * keyword (`caption`, `menu`, ...) or a value with no size names none.
 * @param {string} value
 * @returns {string}
 */
export function fontShorthandFamilyList(value) {
  // A size has a unit (a bare number is a weight); a line height may
  // follow it after a slash.
  const size =
    /(?<=^|\s)(?:[+-]?(?:\d+\.?\d*|\.\d+)(?:[a-z]+|%)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|larger|smaller|(?:calc|clamp|min|max|var)\([^)]*\))(?:\s*\/\s*\S+)?\s+(?=\S)/i;
  // The first size: a family name after it may hold anything.
  const m = size.exec(String(value));
  return m ? String(value).slice(m.index + m[0].length) : '';
}

/**
 * The weight a CSS `font` shorthand gives, as its grammar puts it before
 * the size (`300 16px Inter`, `italic bold 1rem/1.2 Inter`): a number from
 * 1 to 1000 or a weight keyword; null when it gives none (400 then).
 * @param {string} value
 * @returns {string | null}
 */
export function fontShorthandWeight(value) {
  const text = String(value);
  const family = fontShorthandFamilyList(text);
  if (!family) return null;
  const head = text.slice(0, text.length - family.length);
  // The words before the size: style, variant, weight and stretch.
  for (const word of head.split(/\s+/)) {
    if (/^(normal|bold|bolder|lighter)$/i.test(word)) return word.toLowerCase();
    const n = Number(word);
    if (/^\d+(\.\d+)?$/.test(word) && n >= 1 && n <= 1000) return word;
  }
  return null;
}

/**
 * A font value with each `var(--x, ...)` it reads replaced by the values
 * `lookup` gives for `--x` (each of them, when several places set it): the
 * family lists the theme's own values make it show. A `var()` the theme
 * gives no value reads as nothing, its fallback included (the property may
 * come from the app, so the fallback is not a family this theme declares).
 * @param {string} value
 * @param {(name: string) => string[]} lookup
 * @param {number} [depth]
 * @returns {string[]}
 */
export function expandFontVars(value, lookup, depth = 0) {
  const text = String(value);
  const at = text.search(/var\(\s*--/i);
  if (at < 0 || depth > 8) return [text];
  // The var() call, to its matching parenthesis.
  let level = 0;
  let end = -1;
  for (let i = at + 3; i < text.length; i++) {
    if (text[i] === '(') level++;
    else if (text[i] === ')' && --level === 0) {
      end = i;
      break;
    }
  }
  if (end < 0) return [text];
  const inner = text.slice(at + 4, end);
  const comma = inner.indexOf(',');
  const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
  // A fallback is not a family this theme declares: the property may come
  // from the app.
  const given = lookup(name);
  const choices = given.length > 0 ? given : [''];
  return choices
    .flatMap(choice =>
      expandFontVars(
        text.slice(0, at) + choice + text.slice(end + 1),
        lookup,
        depth + 1,
      ),
    )
    .slice(0, 32);
}

/**
 * Collect the font families a resolved theme names but does not load —
 * every `--font-family-*` token plus every component-override `fontFamily`
 * and the families of a `font` shorthand, each `var()` of the theme's own
 * properties read as their values,
 * minus generics, CSS-wide keywords, other `var()` references, and known system
 * families. Source order, first-seen casing, deduped case-insensitively.
 *
 * @param {{tokens?: Record<string, string>, localTokens?: Record<string, string>, components?: object, typography?: {body?: {family?: string, fallbacks?: string}, heading?: {family?: string, fallbacks?: string}, code?: {family?: string, fallbacks?: string}}}} resolvedTheme
 * @param {{tokens?: Record<string, string>, localTokens?: Record<string, string>}} [outer]
 *   the theme a rule's values sit in, whose own properties they read too
 * @returns {string[]}
 */
export function collectUnloadedFonts(resolvedTheme, outer = undefined) {
  const seen = new Set();
  /** @type {string[]} */
  const unloaded = [];
  // A family the theme holds in one of its own properties, read by var(),
  // is a family it names.
  /** @param {string} name @returns {string[]} */
  const lookup = name =>
    [resolvedTheme, outer].flatMap(at =>
      [at?.tokens?.[name], at?.localTokens?.[name]].filter(
        v => typeof v === 'string',
      ),
    );

  /** @param {unknown} value */
  const consider = value => {
    if (typeof value !== 'string') return;
    const families = expandFontVars(value, lookup).flatMap(splitFamilies);
    for (const family of families) {
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
      // A `font` shorthand names its families last.
      else if (key === 'font' && typeof value === 'string')
        consider(fontShorthandFamilyList(value));
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
 * @param {(families: string[]) => string} [recipe] the caller's own way to
 *   load them, in place of the generic recipe
 * @returns {string}
 */
export function formatFontLoadingHelp(
  themeName,
  families,
  recipe = fontLoadingRecipe,
) {
  const named = families.map(f => `"${f}"`).join(', ');
  return `
[note] Theme "${themeName}" names fonts it does not load: ${named}
${recipe(families)}`;
}

/**
 * The same fix once for a batch build: each family the built themes name but
 * do not load, with the themes that name it, then one recipe for all of them.
 *
 * @param {Array<{family: string, themes: string[]}>} entries
 * @param {(families: string[]) => string} [recipe] the caller's own way to
 *   load them, in place of the generic recipe
 * @returns {string}
 */
export function formatBatchFontLoadingHelp(
  entries,
  recipe = fontLoadingRecipe,
) {
  const named = entries
    .map(({family, themes}) => `  "${family}" (${themes.join(', ')})`)
    .join('\n');
  return `
[note] The built themes name fonts they do not load:
${named}
${recipe(entries.map(entry => entry.family))}`;
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
