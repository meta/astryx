// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The type check of one `set` or `undo <theme> <thing>`: the part, the variant, the
 * state, the mode, the token's type, and whether the part (or anything in
 * it) reads the token. A change that cannot take effect is refused, and the
 * refusal leads with the command that works.
 *
 * @position api/theme-edit — checks over the part data
 */

import {CUSTOM_PROPERTY} from '../theme/build/written-values.mjs';
import {readSetLine} from './_set-line.mjs';
import {AstryxError} from '../error.mjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {partForWord, partWords} from './_part-words.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {cssUnescape} from '../../foundation/text/css-escape.mjs';
import {levenshteinDistance} from '../../foundation/text/levenshtein.mjs';
import {baseInstalled, baseThemeFile} from './_project.mjs';
import {
  withFallbacks,
  MATH_FUNCTION,
  cssNumber,
  belowRange,
  fontShorthandParts,
  cssProperties,
  familyListMeant,
  grammarText,
  initialOf,
  keywordsOf,
  matchType,
  matchValue,
  varReferences,
  numbersIn,
  propertyGrammar,
  takesPercentage,
  sameKindValues,
  unitsJoined,
} from './_css.mjs';
import {
  calcVars,
  coreFallback,
  multipliedTokens,
  INHERITED_TEXT,
} from './_parts.mjs';
import {
  AUTO_SPREAD,
  COMMON_STATES,
  COLOR_PROP_PARTS,
  COLOR_PROPS,
  CORNERS,
  ROUND_TO_PILL_STEP,
  DIALS,
  FAMILIES,
  FONT_ROLES,
  FONTS,
  GROUPS,
  HEADING_TRACKING,
  HEADING_WEIGHTS,
  LIKE,
  HOW,
  OPEN_FONTS,
  CSS_WIDE,
  CSS_WIDE_KEYWORDS,
  P,
  SPACING,
  TEXT_SIZE,
  THING_HINTS,
  TYPE_STYLES,
  familyOf,
  wordTable,
  WRAPPED_PARTS,
  CARD_LIKE,
  systemFontFamilies,
  isSystemFamily,
  fontStack,
} from './_tables.mjs';
import {
  COLOR_NAMES,
  colorProblem,
  isColorValue,
  colorAsCssReads,
  isNumber,
  isSafeValue,
  UNSAFE_VALUE,
  LONE_VAR,
  withoutCssEscapes,
  isSize,
  parseColor,
  ratio,
  mixSide,
  splitTop,
  colorSides,
  colorOpacitiesAsCss,
} from './_color.mjs';
import {
  PALETTE_DIALS,
  PALETTE_TOKENS,
  isLookToken,
  VIBRANCY_DEFAULT,
  vibrancyMoves,
  paletteToken,
  seedOf,
} from './_palette.mjs';
import {
  camel,
  kebab,
  closestOf,
  nearest,
  negates,
  partsOf,
  autoMediaPart,
  refuse,
  lengthPx,
  cornersPlain,
  radiusAt,
  radioCircle,
  radioMark,
  radiusTokenOf,
  borderParts,
  cornerParts,
  focusStateOf,
  valueProblem,
  partComponentDocs,
  colorPropTokens,
  innerPropTokens,
  themeFiles,
  ownSourceTokenValues,
  baseTopTokens,
  baseComponent,
  baseComponentReads,
  partRuleTokens,
  cssFamily,
  familySpaces,
  baseTextPx,
  fontsourcePackageOf,
  dialWordOf,
  paddedParts,
  onBuiltInSteps,
  setArgs,
  ARIA_STATES,
  partState,
  partStates,
  savedStateRead,
  propertySpelling,
  modesOf,
  dialNumber,
  dialValueFits,
  groupsOf,
} from './_settings.mjs';
import {isColorToken} from './_compiler.mjs';
import {
  trimInsideQuotes,
  colorPair,
  otherSettingLabel,
  familiesOf,
  familyPieces,
  normalValueText,
  normalizeEntry,
  withoutDebris,
  typoOf,
  typoNear,
  stateSpelling,
  modeNear,
  modeWord,
  documentTypoWords,
  PROPERTY_WORDS,
  WEIGHT_WORDS,
  TAILWIND_RADIUS,
  documentReadings,
  documentNumericTable,
  documentRange,
  withoutCopyDebris,
  commaNumbers,
  thousandsSetting,
  baseWord,
} from './_normal.mjs';

export {
  familiesOf,
  familyPieces,
  normalValueText,
  normalizeEntry,
  withoutDebris,
};
import {quoteCommandArgument} from '../../foundation/env/package-manager.mjs';

export {lengthPx};

/**
 * The radius the base theme's own rule gives a part, in px, or null when
 * its rule gives none.
 * @param {any} ctx
 * @param {{light: Record<string, string>}} base
 * @param {string} part
 * @param {string | undefined} when
 * @returns {number | null}
 */
function basePartRadiusPx(ctx, base, part, when) {
  const own = ctx.base
    ? baseComponent(ctx.base, ctx, part, 'borderRadius', {when})
    : null;
  if (typeof own !== 'string') return null;
  const tokenName = /var\(\s*(--radius-[\w-]+)/.exec(own)?.[1];
  if (tokenName) return tokenPx(base, tokenName);
  const px = lengthPx(own);
  return px == null ? null : Math.min(px, 9999);
}

/**
 * A token's value in px, following var() references through the tokens.
 * @param {{light: Record<string, string>}} base
 * @param {string} token
 * @returns {number | null}
 */
function tokenPx(base, token) {
  let v = base.light[token] ?? '';
  for (let i = 0; i < 5; i++) {
    const ref = /^\s*var\((--[\w-]+)\)\s*$/.exec(v);
    if (!ref) break;
    v = base.light[ref[1]] ?? '';
  }
  return lengthPx(v);
}

// A type scale ratio is a number above 1, up to 2.
documentNumericTable(
  ['type'],
  Object.entries(TYPE_STYLES).map(([name, style]) => [name, style.ratio]),
  [1, 2],
);

/**
 * The `type` preset nearest a scale ratio typed as a number (1.3 is
 * editorial), or null for a number that is no ratio (16).
 * @param {string} v
 * @returns {string | null}
 */
function ratioPreset(v) {
  if (!/^\d+(\.\d+)?$/.test(v)) return null;
  const r = Number(v);
  if (!(r > 1 && r <= 2)) return null;
  return Object.entries(TYPE_STYLES).reduce((a, b) =>
    Math.abs(b[1].ratio - r) < Math.abs(a[1].ratio - r) ? b : a,
  )[0];
}

/**
 * The value of the mode dial a word means, by the one mode reader (`night`,
 * `dark mode` and `dark` are dark-only), or null.
 * @param {string} v
 * @returns {'both' | 'light-only' | 'dark-only' | null}
 */
export function modeDialValue(v) {
  const lower = String(v)
    .trim()
    .toLowerCase()
    .replace(/^mode\s*[=:]\s*/, '');
  if (['both', 'light-only', 'dark-only'].includes(lower))
    return /** @type {'both' | 'light-only' | 'dark-only'} */ (lower);
  const word = DIAL_WORDS.mode[lower];
  if (word) return /** @type {'both' | 'light-only' | 'dark-only'} */ (word);
  const oneMode = modeWord(lower);
  return oneMode ? `${oneMode}-only` : null;
}

/**
 * A `set` (or `undo`) command for a setting, with its scope, to suggest;
 * a thing of more than one word (`background color`) is quoted, as its value is.
 * @param {string} slug
 * @param {string} thing
 * @param {string} value
 * @param {{on?: string, when?: string, state?: string, mode?: string, only?: boolean}} s
 * @param {boolean} [unset]
 */
export const setLine = (slug, thing, value, s, unset = false) =>
  `${P} ${unset ? 'undo' : 'set'} ${slug} ${quoteCommandArgument(thing)}${value ? ` ${quoteCommandArgument(value)}` : ''}${s.on ? ` --on ${s.on}` : ''}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}${s.only ? ' --only' : ''}`;

/** @param {string} v */
const cornerPxOf = v =>
  CORNERS.find(([n]) => n === v)?.[1] ?? lengthPx(v) ?? Number.NaN;

const E = ERROR_CODES;

/**
 * Why the math in a value's calc() cannot work, or null: each `+`/`-`
 * needs two sides of one kind (a length with a length or a percentage, a
 * number with a number), `*` needs a plain number on one side, `/` a plain
 * number on the right. A var() counts as its fallback; one with none, or a
 * nested min(), max() or clamp(), is not judged.
 * @param {string} value
 * @returns {string | null}
 */
export function calcUnitProblem(value) {
  const text = String(value);
  const re = /\bcalc\(/gi;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = matchingParen(text, open);
    if (close < 0) return null;
    let expr = text.slice(open + 1, close);
    // Each var() is its fallback, innermost first.
    for (let i = 0; i < 20 && /\bvar\(/i.test(expr); i += 1) {
      const at = expr.search(/\bvar\((?:[^()]|\([^()]*\))*\)/i);
      const v = /\bvar\(((?:[^()]|\([^()]*\))*)\)/i.exec(expr.slice(at));
      if (at < 0 || !v) return null;
      const comma = v[1].indexOf(',');
      if (comma < 0) return null;
      expr = `${expr.slice(0, at)}(${v[1].slice(comma + 1).trim()})${expr.slice(at + v[0].length)}`;
    }
    if (/[a-z-]+\(/i.test(expr.replace(/\bcalc\(/gi, '('))) continue;
    const found = expr.match(/\d*\.?\d+(?:e[+-]?\d+)?[a-z%]*|[-+*/()]/gi);
    if (!found) continue;
    const tokens = found;
    let pos = 0;
    /** @returns {string | null} */
    const kindOf = (/** @type {string} */ t) => {
      const u = /[a-z%]*$/i.exec(t)?.[0].toLowerCase() ?? '';
      if (!u) return 'number';
      if (u === '%') return 'percent';
      if (/^(m?s)$/.test(u)) return 'time';
      if (/^(deg|rad|grad|turn)$/.test(u)) return 'angle';
      return 'length';
    };
    /** @type {string | null} */
    let why = null;
    const fail = (/** @type {string} */ w) => {
      why ??= w;
      return 'number';
    };
    const join = (
      /** @type {string} */ a,
      /** @type {string} */ b,
      /** @type {string} */ op,
    ) => {
      if (op === '+' || op === '-') {
        if (a === b) return a;
        const lp = new Set([a, b]);
        if (lp.has('length') && lp.has('percent') && lp.size === 2)
          return 'length';
        return fail(`${a} ${op} ${b} adds two kinds of value`);
      }
      if (op === '*') {
        if (a === 'number') return b;
        if (b === 'number') return a;
        return fail(`${a} * ${b} multiplies two values with units`);
      }
      if (b === 'number') return a;
      return fail(`${a} / ${b} divides by a value with a unit`);
    };
    /** @returns {string} */
    const factor = () => {
      const t = tokens[pos++];
      if (t === '(') {
        const k = sum();
        pos++;
        return k;
      }
      if (t === '-' || t === '+') return factor();
      return t == null ? 'number' : (kindOf(t) ?? 'number');
    };
    /** @returns {string} */
    const product = () => {
      let k = factor();
      while (tokens[pos] === '*' || tokens[pos] === '/') {
        const op = tokens[pos++];
        k = join(k, factor(), op);
      }
      return k;
    };
    /** @returns {string} */
    function sum() {
      let k = product();
      while (tokens[pos] === '+' || tokens[pos] === '-') {
        const op = tokens[pos++];
        k = join(k, product(), op);
      }
      return k;
    }
    sum();
    if (why) return why;
  }
  return null;
}

/**
 * The fallbacks of the var() calls inside a value that is not one var()
 * alone (`calc(var(--x, 4px) * 2)`), in order. A var() with an empty
 * fallback (`var(--x,)`) gives ''.
 * @param {string} value
 * @returns {Array<{fallback: string, within: string[]}>} each fallback, with
 *   the names of the functions around its var(), innermost first
 */
function innerVarFallbacks(value) {
  const text = value.trim();
  if (/^var\(/i.test(text) && matchingParen(text, 3) === text.length - 1)
    return [];
  /** @type {Array<{fallback: string, within: string[]}>} */
  const out = [];
  const re = /\bvar\(/gi;
  let m;
  while ((m = re.exec(text))) {
    const open = m.index + m[0].length - 1;
    const close = matchingParen(text, open);
    if (close < 0) break;
    const inner = text.slice(open + 1, close);
    let depth = 0;
    for (let i = 0; i < inner.length; i += 1) {
      const c = inner[i];
      if (c === '(') depth += 1;
      else if (c === ')') depth -= 1;
      else if (c === ',' && depth === 0) {
        out.push({
          fallback: inner.slice(i + 1).trim(),
          within: enclosingFunctions(text, m.index),
        });
        break;
      }
    }
  }
  return out;
}

/**
 * The names of the functions whose parentheses are open at `at`, innermost
 * first.
 * @param {string} text
 * @param {number} at
 * @returns {string[]}
 */
function enclosingFunctions(text, at) {
  /** @type {string[]} */
  const open = [];
  for (let i = 0; i < at; i += 1) {
    if (text[i] === '(')
      open.push(/([a-z-]*)$/i.exec(text.slice(0, i))?.[1] ?? '');
    else if (text[i] === ')') open.pop();
  }
  return open.reverse();
}

/**
 * The index of the parenthesis that closes the one at `open`, or -1.
 * @param {string} text
 * @param {number} open
 */
function matchingParen(text, open) {
  let depth = 0;
  for (let i = open; i < text.length; i += 1) {
    if (text[i] === '(') depth += 1;
    else if (text[i] === ')') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/** A yes or no word, which `rounded` reads as round or square. */
const YES_NO = /^(true|yes|on|none|false|off|no)$/i;

/**
 * A value as the corners dial reads it: a rung in any case, or a size with
 * its unit (`10PX`, `1rem`) in px; null for anything else, a bare number
 * included.
 * @param {string} v
 * @returns {string | null}
 */
function cornersRead(v) {
  // A comma between digits as the one comma rule reads it (0,5rem).
  const lower = commaNumbers(String(v).trim().toLowerCase());
  if (CORNERS.some(([n]) => n === lower)) return lower;
  if (/^(0|none|sharp|zero|flat)$/.test(lower)) return 'square';
  if (/^[+-]?\d*\.?\d+$/.test(lower)) return null;
  const px = lengthPx(lower);
  return px != null && px >= 0 ? `${Math.round(px * 100) / 100}px` : null;
}

/**
 * A text size written another way (20px, 2e1, +20, 1.25rem, 125%, `20 px`,
 * `1,25rem`) as the body size in pixels text-size takes, kept to its 10 to
 * 32 (a size past an end is that end); null when it reads as no size.
 * @param {string} v
 * @returns {number | null}
 */
function textSizePx(v) {
  // Paste debris around the size (quotes, `!important`, a trailing `;` or
  // `,`) is not part of it.
  const bare = withoutDebris(
    String(v)
      .replace(/^\s*(["'])(.*)\1\s*$/, '$2')
      .replace(/\s*!\s*important\s*/i, '')
      .replace(/[;,]+\s*$/, ''),
  );
  const plain = typedPlain(bare)
    .replace(/(\d)\.(?=[a-z%]*$)/i, '$1')
    // A unit split off by a space (`16 px`), and the spaces of a math
    // function (`calc(1rem + 2px)`); two numbers stay two.
    .replace(/(\d)\s+(?=[a-z%])/gi, '$1')
    .replace(/\s*([*/+()-])\s*/g, '$1')
    .replace(/^(\d+),(\d+)/, '$1.$2');
  // A constant calc() of px and rem sizes (`calc(16px + 2px)`) is worked out.
  const calc =
    /^calc\((\d*\.?\d+)(px|rem|em)?([*/+-])(\d*\.?\d+)(px|rem|em)?\)$/i.exec(
      plain,
    );
  if (calc) {
    const px = (/** @type {string} */ n, /** @type {string | undefined} */ u) =>
      Number(n) * (u && /r?em/i.test(u) ? 16 : 1);
    const [a, b] = [px(calc[1], calc[2]), px(calc[4], calc[5])];
    const op = calc[3];
    // Sizes add and subtract; a size scales by a plain number.
    const r =
      op === '+' || op === '-'
        ? calc[2] && calc[5]
          ? op === '+'
            ? a + b
            : a - b
          : null
        : op === '*'
          ? calc[2] && calc[5]
            ? null
            : a * b
          : calc[5]
            ? null
            : a / b;
    return r != null && Number.isFinite(r) && r >= 10 && r <= 32
      ? Math.round(r * 100) / 100
      : null;
  }
  const m = /^\+?(\d*\.?\d+(?:e[+-]?\d+)?)(px|rem|em|pt|%)?$/i.exec(plain);
  if (!m) return null;
  // A bare number under 4 (1.5, 1.125) reads as rem as much as px: no
  // size is guessed for it.
  if (!m[2] && Number(m[1]) < 4) return null;
  const unit = (m[2] ?? '').toLowerCase();
  const n =
    Number(m[1]) *
    (/r?em/.test(unit)
      ? 16
      : unit === '%'
        ? 16 / 100
        : unit === 'pt'
          ? 4 / 3
          : 1);
  const px = Math.round(n * 100) / 100;
  return Math.max(10, Math.min(32, px));
}

/**
 * A value as it reads once what an input method or a stylesheet adds is
 * taken off: full-width digits, letters and signs (`１８`, `＃`) as their
 * plain forms, and CSS comments.
 * @param {string} v
 */
function typedPlain(v) {
  return v
    .normalize('NFKC')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * A value pasted as a CSS declaration (`color: #e11d48;`, `font-weight: 700
 * !important`), from devtools or a stylesheet: its property and value, with
 * the `;` and `!important` gone. Null when the value is not a declaration (a
 * URL's `https:` is not a property).
 * @param {string} v
 * @returns {{property: string, value: string} | null}
 */
export function pastedDeclaration(v) {
  const plain = typedPlain(v);
  const m = /^(--[a-z0-9-]+|[a-z][a-z-]*)\s*:\s*(?!\/\/)(.*)$/i.exec(plain);
  if (!m || /^(https?|data|file|blob)$/i.test(m[1])) return null;
  const value = m[2]
    .replace(/;+\s*$/, '')
    .replace(/\s*!\s*important\s*$/i, '')
    .replace(/;+\s*$/, '')
    .trim();
  // `font-family: ;` names a property and no value: value is ''.
  return {property: m[1].toLowerCase(), value};
}

/**
 * A font pasted as a declaration (`font-family: Georgia, serif;`, from
 * devtools or a stylesheet), as the family list it names; a `font:`
 * shorthand gives its family; '' when it names the property and no value.
 * Null when the value is not a pasted declaration.
 * @param {string} v
 * @returns {string | null}
 */
export function pastedFont(v) {
  const d = pastedDeclaration(v);
  if (!d || !/^font(-family)?$/.test(d.property)) return null;
  const rest = d.value;
  // `font-family: ;` gives no font: '' (the caller refuses it).
  if (!rest) return '';
  if (d.property === 'font-family') return rest;
  const parts = fontShorthandParts(rest);
  return parts && typeof parts['font-family'] === 'string'
    ? parts['font-family']
    : null;
}

/**
 * The values a value may have meant, when what is wrong is how it was
 * typed: plain (full-width characters, comments and a trailing `;` gone,
 * quotes around a whole non-font value dropped), and for a font list each
 * family quoted as CSS needs it (`Font Awesome 6 Free`). Only values that
 * differ from the one typed.
 * @param {string} type
 * @param {string} value
 */
function valueMeant(type, value) {
  // `!important` is not part of a token's value (the theme places its
  // rules itself), nor is a trailing `;` or an old browser hack's escape:
  // the value without them (the one copy-debris cleanup).
  /** @type {string} */
  let p = withoutCopyDebris(
    type === 'font' || type === 'font-family'
      ? pastedFont(value) || value
      : pastedDeclaration(value)?.value || typedPlain(value),
  );
  // Copy debris around it (a trailing comma, a stray quote or bracket).
  p = withoutDebris(p).trim();
  const q = /^(["'])(.*)\1$/.exec(p);
  if (q && type !== 'font') p = q[2].trim();
  const out = [p];
  // A var() of the app's own variable with a fallback: the fallback is the
  // value meant (`var(--brand, #e11d48)` → #e11d48).
  const fb = /^var\(\s*--[a-z0-9-]+\s*,\s*(.+)\)$/i.exec(p);
  if (fb) out.push(fb[1].trim());
  if (type === 'font' || type === 'font-family') {
    // A comma left out between families (`"Open Sans" serif`), read with
    // css-tree.
    // The stack read as families (a trailing comma, a stack wrapped in one
    // more pair of quotes), each quoted as CSS needs it.
    const fams = familiesOf(p);
    // A number or size is no family: never quoted into one (`"700"`).
    if (fams?.length && !fams.some(f => NUMBERISH.test(f)))
      out.push(fams.map(f => cssFamily(f, true)).join(', '));
    const listed = familyListMeant(p);
    if (listed && !fams?.length) out.push(listed);
  }
  // A comma rgb() or hsl() CSS does not take as written: the same channels
  // in the syntax CSS reads them in.
  if (type === 'color') {
    const asRead = colorAsCssReads(p);
    if (asRead) out.push(asRead);
  }
  return [...new Set(out)].filter(x => x && x !== value.trim());
}

/**
 * Whether a value is one length that works inside calc(): a length with a
 * unit, a variable (with a fallback that is one too), or calc(), min(),
 * max() or clamp() giving a length; never several values, a bare number
 * (calc() cannot add one to a length, 0 included), a percentage or a
 * keyword.
 * @param {string} v
 * @returns {boolean}
 */
function oneLength(v) {
  const t = v.trim();
  if (splitTop(t, ' ').length !== 1) return false;
  const ref = /^var\(\s*--[a-z0-9-]+\s*(?:,(.*))?\)$/i.exec(t);
  if (ref) return ref[1] == null || oneLength(ref[1]);
  if (MATH_FUNCTION.test(t)) return matchType('length', t) != null;
  const n = cssNumber(t);
  return !!n && !!n.unit && n.unit !== '%';
}

/** The size units a typo is read against. */
const SIZE_UNITS = ['px', 'rem', 'em', '%', 'vh', 'vw', 'ch'];

/**
 * The size meant by a value one slip away from one: a space inside
 * (`16 px`), a decimal comma (`1,5rem`), a doubled or mistyped unit
 * (`16pxx`), a dot with no digit after it (`1.px`); null when none reads.
 * @param {string} v
 * @param {(x: string) => boolean} ok
 */
function sizeMeant(v, ok) {
  const t = v.trim();
  const n = typedPlain(t);
  const tries = [
    n,
    n.replace(/(\d)\.(?=[a-z%]|$)/gi, '$1'),
    t.replace(/(\d)\.(?=[a-z%]|$)/gi, '$1'),
    // A unit split off by a space (`16 px`); two numbers (`12 16px`) are
    // never joined into one.
    t.replace(/(\d)\s+(?=[a-z%])/gi, '$1'),
    // A comma between digits as the one comma rule reads it (a decimal
    // comma, or a thousands mark in a pixel length: 1,200px).
    commaNumbers(t).replace(/(\d)\s+(?=[a-z%])/gi, '$1'),
    mathSpaced(t),
  ];
  const m = /^([+-]?\d*\.?\d+)\s*([a-z%]+)$/i.exec(commaNumbers(t));
  if (m) {
    // A unit typed with a letter too many (pxx, remm, pxs).
    const unit = [...SIZE_UNITS]
      .sort((a, b) => b.length - a.length)
      .find(u => m[2].toLowerCase().startsWith(u));
    if (unit) tries.push(`${m[1]}${unit}`);
  }
  return tries.find(x => x !== t && ok(x)) ?? null;
}

/**
 * A math function with the spaces CSS needs around `+` and `-` put back
 * (`calc(1rem+2px)` is `calc(1rem + 2px)`); the value as it is otherwise.
 * @param {string} v
 */
function mathSpaced(v) {
  if (!/^(calc|min|max|clamp)\(/i.test(v) || /\bvar\(/i.test(v)) return v;
  return v.replace(/(\d(?<![\d.]e)|[%a-z)])([+-])(?=[\d.(])/gi, '$1 $2 ');
}

/**
 * The number meant by a value one slip away from one: a unit on a number
 * (`700px`), a decimal comma (`1,5`), letter O for zero (`7OO`), a weight
 * past the range (`1001` is 1000), a math function with no spaces around
 * `+` or `-`; null when none reads.
 * @param {string} v
 * @param {string} name the token
 * @param {(x: string) => boolean} ok
 */
function numberMeant(v, name, ok) {
  const t = v.trim();
  const plain = typedPlain(t).replace(/(\d)\.$/, '$1');
  const comma = commaNumbers(plain, thousandsSetting(name));
  const tries = [
    /^[\doO.]+$/.test(plain) && /\d/.test(plain)
      ? plain.replace(/[oO]/g, '0')
      : plain,
    comma.replace(/^([+-]?\d*\.?\d+)\s*[a-z]+$/i, '$1'),
    comma,
    mathSpaced(t),
  ];
  if (/weight/.test(name)) {
    const n = Number(tries[1]);
    if (Number.isFinite(n)) tries.push(String(Math.min(1000, Math.max(1, n))));
  }
  return tries.find(x => x !== t && ok(x)) ?? null;
}

/**
 * The value to carry into a suggestion for another dial: the one given when
 * that dial takes it, else the dial's example.
 * @param {string} dial @param {string} v
 */
function valueFor(dial, v) {
  if (PALETTE_DIALS.includes(dial)) return colorProblem(v) ? '#7c3aed' : v;
  if (dial === 'vibrancy')
    return /^(more|less)$/.test(v) || (/^\d{1,3}$/.test(v) && Number(v) <= 100)
      ? v
      : '60';
  return v;
}

/**
 * The other words for each color dial and vibrancy (gray, brand, error,
 * saturation), from the dial tables, without words that name a part, a CSS
 * property or a plain color.
 */
const COLOR_DIAL_WORDS = (() => {
  const generic = new Set([
    'color',
    'colour',
    'text',
    'background',
    'border',
    'surface',
    'surfaces',
    'main',
    'key',
    'link',
    'selection',
    'seed',
    'status',
    'tint',
    'highlight',
    'muted',
    'red',
    'green',
    'blue',
    'yellow',
    'orange',
  ]);
  /** @type {Map<string, string[]>} */
  const out = new Map();
  for (const d of [...PALETTE_DIALS, 'vibrancy'])
    for (const w of String(DIALS[d]?.words ?? '').split(/\s+/)) {
      if (!w || w === d || generic.has(w)) continue;
      out.set(w, [...(out.get(w) ?? []), d]);
    }
  return out;
})();

/**
 * @typedef {object} SetFlags
 * @property {string} [on]
 * @property {string} [when]
 * @property {string} [state]
 * @property {string} [mode]
 * @property {boolean} [only]
 */

/**
 * The first exact token setting whose value the type rules refuse now (a
 * hand edit, or a value an earlier release took), with why; null when all
 * pass. `skip` is the thing the command changes or removes.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string | {thing: string, on?: string, when?: string, state?: string, mode?: string}} [skip]
 * @returns {Array<{setting: import('./_settings.mjs').Setting, why: string, scope?: boolean, fix?: string, noEffect?: boolean}>} every saved setting the editor no longer accepts (`fix`: the clean value to set, when one reads; `noEffect`: refused as it never shows where it is saved)
 */
export function storedProblems(ctx, slug, data, skip = '') {
  // The setting the command replaces (its thing in the same scope); a
  // setting of the same thing elsewhere is still checked.
  const skipThing = typeof skip === 'string' ? skip : skip.thing;
  /** @param {import('./_settings.mjs').Setting} s */
  const replaced = s =>
    typeof skip === 'string'
      ? s.thing === skip
      : s.thing === skip.thing &&
        (s.on ?? '') === (skip.on ?? '') &&
        (s.when ?? '') === (skip.when ?? '') &&
        (s.state ?? '') === (skip.state ?? '') &&
        (s.mode ?? '') === (skip.mode ?? '');
  /** @type {Array<{setting: import('./_settings.mjs').Setting, why: string, scope?: boolean, fix?: string, noEffect?: boolean}>} */
  const found = [];
  const TOKENS = ctx.project.core.tokenDefaults;
  // Where each saved setting applies names a real part, group, state and
  // variant of this Core, as `set` checks them.
  const WHOLE_ONLY = [
    'surfaces',
    'buttons',
    'base',
    'mode',
    'vibrancy',
    'text-size',
    'headings',
    'type',
    ...PALETTE_DIALS,
  ];
  for (const s of data.settings) {
    if (s.thing === skipThing) continue;
    /** @param {string} why */
    const scope = why => ({setting: s, why, scope: true});
    const problem = (() => {
      const t = s.on ? ctx.project.target.get(s.on) : null;
      if (
        s.on &&
        !t &&
        !groupsOf(ctx)[s.on] &&
        !(s.thing === 'font' && FONT_ROLES.includes(s.on))
      )
        return scope(`there is no part or group "${s.on}"`);
      // A token that is no design token, or a part property that is no
      // CSS property or names no part, styles nothing: reported, never
      // built.
      if (s.source === 'token' && !(s.thing in TOKENS))
        return {setting: s, why: `${s.thing} is not a design token`};
      if (s.source === 'property' && !s.on)
        return {
          setting: s,
          why: `${s.thing} is a CSS property, so it needs a part (--on)`,
        };
      if (
        s.source === 'property' &&
        !s.thing.startsWith('--') &&
        !cssProperties().has(s.thing)
      )
        return {setting: s, why: `${s.thing} is not a CSS property`};
      // A value its CSS grammar does not take (a hand edit: padding
      // banana) is dropped by the browser: reported by name, never built.
      if (s.source === 'property' && !s.thing.startsWith('--')) {
        const bad = propertyProblem(s.thing, String(s.value ?? ''));
        if (bad)
          return {
            setting: s,
            why: `${s.thing} takes ${bad.takes}, not "${String(s.value ?? '').slice(0, 60)}"`,
          };
      }
      if (s.source === 'dial' && s.on && WHOLE_ONLY.includes(s.thing))
        return scope(`${s.thing} applies to the whole theme, not to ${s.on}`);
      if (s.mode && s.source === 'dial' && !PALETTE_DIALS.includes(s.thing))
        return scope(`${s.thing} is the same in light and dark`);
      // A light and a dark pair saved for one mode (a hand edit): set
      // refuses that, so the loader does too; the repair is the half saved
      // for that mode.
      if (s.mode && /^\s*light-dark\(/i.test(String(s.value ?? ''))) {
        const pair = colorPair(
          String(s.value)
            .trim()
            .replace(/^light-dark\(\s*([\s\S]*)\)\s*$/i, 'light: $1')
            .replace(/,\s*/, '; dark: '),
        );
        return {
          setting: s,
          why: `${s.thing} gives both modes with light-dark(), and is saved for ${s.mode} only`,
          ...(pair ? {fix: s.mode === 'dark' ? pair.dark : pair.light} : {}),
        };
      }
      if (
        t &&
        s.state &&
        !statesHold(
          partStates(ctx, /** @type {string} */ (s.on)),
          // A state in a spelling set reads (is-pressed) is the part's own.
          savedStateRead(ctx, s) ?? s.state,
        )
      )
        return scope(`"${s.state}" is not a state of ${s.on}`);
      if (t && s.when)
        for (const w of String(s.when).split('+')) {
          const [prop, value] = w.split(':');
          const values = ctx.C.variantValues(/** @type {string} */ (s.on));
          if (!(prop in values)) return scope(`${s.on} has no prop "${prop}"`);
          if (values[prop].length && !values[prop].includes(value))
            return scope(`${s.on} has no ${prop} "${value}"`);
        }
      return null;
    })();
    if (problem) found.push(problem);
  }
  // Every part setting and the font dial are checked as set checks a value
  // typed in (a CSS keyword where no family is, one length where Core reads
  // a padding inside calc(), a value the property's grammar refuses …), so
  // a hand edit set would refuse is reported, never built, as compile does.
  const scoped = new Set(found.map(f => f.setting));
  for (const s of data.settings) {
    if (replaced(s) || scoped.has(s)) continue;
    if (!(
      s.source === 'property' ||
      (s.source === 'dial' && s.thing === 'font')
    ))
      continue;
    try {
      checkSetting(
        ctx,
        slug,
        {
          ...data,
          // A saved setting for one mode stays saved when the theme keeps
          // one mode (it applies again with both): the rule that refuses
          // --mode on a one-mode theme is for a value typed in.
          ...(s.mode ? {mode: 'both'} : {}),
          settings: data.settings.filter(x => x !== s),
        },
        s.thing,
        s.value,
        {on: s.on, when: s.when, state: s.state, mode: s.mode, only: s.only},
      );
    } catch (e) {
      if (!(e instanceof AstryxError)) throw e;
      found.push({
        setting: s,
        why:
          e instanceof Error
            ? e.message.replace(/ Nothing was changed\.$/, '')
            : String(e),
        // Refused for having no effect where it is saved: it never shows.
        ...(e.code === E.ERR_THEME_NO_EFFECT ? {noEffect: true} : {}),
      });
    }
  }
  // A hand edit that put an invisible or non-breaking space in any value
  // (the browser reads `rgb(1\u00A02\u00A03)` as invalid, a family with a
  // zero-width space as another font): named, with the value as set writes
  // it.
  for (const s of data.settings) {
    if (replaced(s) || typeof s.value !== 'string') continue;
    // Read as typed input is (a font family's quotes trimmed too), so the
    // line offered is the value set would save.
    const clean = /font/i.test(s.thing)
      ? trimInsideQuotes(normalValueText(s.value))
      : normalValueText(s.value);
    if (clean !== s.value) {
      // Name what is wrong: invisible spaces, or quotes around the value
      // CSS does not read (a curly quote inside a quoted string is fine,
      // and is left as it is).
      const spaces =
        clean.replace(/["']/g, '') !==
        s.value.replace(
          /[\u2018-\u201F\u00AB\u00BB\u2039\u203A\u300C-\u300F\uFF02\uFF07`"']/g,
          '',
        );
      const quotes =
        /[\u2018-\u201F\u00AB\u00BB\u2039\u203A\u300C-\u300F\uFF02\uFF07`]/.test(
          s.value,
        ) &&
        clean.replace(
          /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u200B-\u200D\u2060\uFEFF]/g,
          '',
        ) !==
          s.value.replace(
            /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000\u200B-\u200D\u2060\uFEFF]/g,
            '',
          );
      const why = [
        spaces &&
          'a no-break, thin or zero-width space, which the browser does not read as a space',
        quotes &&
          'curly or other quotes around a value, where CSS reads only straight ones',
      ].filter(Boolean);
      found.push({
        setting: s,
        why: `${s.thing} holds ${why.join(', and ') || 'characters the browser does not read as written'}`,
        fix: clean,
      });
    }
  }
  for (const s of data.settings) {
    if (s.source !== 'token' || s.thing === skipThing || !(s.thing in TOKENS))
      continue;
    if (found.some(f => f.setting === s)) continue;
    // A var() a hand edit put in that names no design token reads nothing,
    // as set refuses it.
    const bad = unknownVarRef(String(s.value ?? ''), TOKENS, s.thing);
    if (bad) {
      found.push({
        setting: s,
        why: bad.message,
        ...(bad.fixed ? {fix: bad.fixed} : {}),
      });
      continue;
    }
    try {
      checkTypedValue(
        ctx.C.typeOf(s.thing),
        s.value,
        s.thing,
        TOKENS,
        ctx.C.typeOf,
        slug,
        ctx.C.propsReading(s.thing),
        multipliedTokens(ctx.project).has(s.thing),
      );
      checkCycle(s.thing, s.value, TOKENS, data, ctx.project.cwd, s);
    } catch (e) {
      // The value the check itself suggests, as for typed input.
      const line = /** @type {any} */ (e)?.suggestions?.find(
        (/** @type {any} */ x) =>
          x.name.startsWith(`${P} set ${slug} ${s.thing} `),
      )?.name;
      found.push({
        setting: s,
        why:
          e instanceof Error
            ? e.message.replace(/ Nothing was changed\.$/, '')
            : String(e),
        ...(line
          ? {fix: unquoteArg(line.slice(`${P} set ${slug} ${s.thing} `.length))}
          : {}),
      });
    }
  }
  return found;
}

/** The generic families a font list ends with. */
const GENERIC_FAMILIES = [
  'serif',
  'sans-serif',
  'monospace',
  'system-ui',
  'cursive',
  'fantasy',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
];
documentTypoWords(GENERIC_FAMILIES);
documentTypoWords([...Object.keys(FONTS), ...Object.keys(OPEN_FONTS)]);
// The system families the font readers compare a typo with: the gate
// takes the family they offer.
documentTypoWords(systemFontFamilies());

/** The theme-wide dial or token for a CSS property typed with no part. */
const WHOLE_THEME_EQUIVALENT = /** @type {Record<string, string>} */ ({
  'border-radius': 'corners',
  'font-size': 'text-size',
  'font-family': 'font',
  color: '--color-text-primary',
  background: '--color-background-body',
  'background-color': '--color-background-body',
});

/**
 * The one mode a whole-theme color belongs to, or null: a theme showing
 * both modes takes a page or text color that suits one of them (a dark
 * page, light text) in that mode only, since the same value in both would
 * leave the other unreadable. Measured against what the theme shows now,
 * by the contrast the page and its text keep.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {any} data
 * @param {string} token the whole-theme token the value would set
 * @param {string} value
 * @returns {'light' | 'dark' | null}
 */
function modeColorBelongs(ctx, data, token, value) {
  if (!/^--color-(background-body|text-primary)$/.test(token)) return null;
  if (modesOf(data).length < 2) return null;
  const want = parseColor(String(value).trim());
  if (!want) return null;
  // The other side of the pair, as the theme shows it now: a page color is
  // read against that mode's text, a text color against its page.
  const other =
    token === '--color-background-body'
      ? '--color-text-primary'
      : '--color-background-body';
  const saved = (data.settings ?? []).filter(
    (/** @type {any} */ x) => x.thing === other && !x.on,
  );
  const shown = (/** @type {'light' | 'dark'} */ m) => {
    const own =
      saved.find((/** @type {any} */ x) => x.mode === m) ??
      saved.find((/** @type {any} */ x) => !x.mode);
    const raw = String(
      own?.value ?? ctx.project.core.tokenDefaults?.[other] ?? '',
    );
    // `light-dark(a, b)`, as the token defaults write a pair.
    const inner = /^light-dark\(\s*([\s\S]*)\)$/i.exec(raw.trim())?.[1];
    const sides = inner ? splitTop(inner, ',').map(x => x.trim()) : null;
    return parseColor(
      sides && sides.length === 2 ? sides[m === 'dark' ? 1 : 0] : raw,
    );
  };
  /** @type {Array<['light' | 'dark', number]>} */
  const kept = [];
  for (const m of /** @type {const} */ (['light', 'dark'])) {
    const against = shown(m);
    if (!against) return null;
    kept.push([m, ratio(want, against)]);
  }
  const [best, worst] = [...kept].sort((a, b) => b[1] - a[1]);
  // One mode keeps text readable and the other does not: that mode.
  return best[1] >= 4.5 && worst[1] < 3 ? best[0] : null;
}

/**
 * Words that name a dial together with the value they ask for: the word
 * typed as the setting, the values typed for it, and the dial and value
 * they mean (`shadows none` is `surfaces flat`; `dark-mode true` is `mode
 * dark-only`). Registered as documented readings, so the line it offers
 * passes the repair gate.
 * @type {Array<{words: RegExp, values: string[], dial: string, value: string}>}
 */
const DIAL_VALUE_WORDS = [
  {
    words: /^(?:shadows?|elevation)$/,
    values: ['none', 'off', 'no', '0', 'false', 'flat'],
    dial: 'surfaces',
    value: 'flat',
  },
  {
    words: /^(?:dark|darkmode)$/,
    values: ['true', 'yes', 'on', '1'],
    dial: 'mode',
    value: 'dark-only',
  },
  {
    words: /^(?:light|lightmode)$/,
    values: ['true', 'yes', 'on', '1'],
    dial: 'mode',
    value: 'light-only',
  },
];
documentReadings(
  DIAL_VALUE_WORDS.flatMap(x =>
    x.values.map(w => /** @type {[string, string]} */ ([w, x.value])),
  ),
);

/**
 * The dial and value a word typed as the setting means with its value, by
 * DIAL_VALUE_WORDS, or null.
 * @param {string} word the setting as typed, lowercase
 * @param {string} value
 * @returns {{dial: string, value: string} | null}
 */
function dialValueOf(word, value) {
  const w = word.replace(/[-_ ]?(?:colou?r|mode)$/, '') || word;
  const typed = value.trim().toLowerCase();
  const hit = DIAL_VALUE_WORDS.find(
    x => x.words.test(w) && x.values.includes(typed),
  );
  return hit ? {dial: hit.dial, value: hit.value} : null;
}

/** A number or a size, which is never a font family. */
const NUMBERISH = /^[+-]?(\d+\.?\d*|\.\d+)(px|rem|em|pt|%)?$/i;

/**
 * What is wrong with a typed family list, or null. Each family of the list
 * is read on its own, from its end:
 * - a size (`18px`, `Inter 16px`) is no family; a number is a weight only
 *   as a whole hundred (100 to 1000), and any other bare number
 *   (`Lato, 16`) is neither a weight nor a family;
 * - a weight (`600`, `ExtraBold`, `extra bold`, any form the weight table
 *   reads) or a style (`Italic`, `Oblique`) after a family's name is that
 *   family and the weight or style; a weight or style WORD is part of the
 *   name unless the whole name is no family the editor knows and the name
 *   without it is (knownFamily: `Arial Black` and `Segoe UI Semibold` are
 *   families; `Inter ExtraBold` and `Inter Italic` are Inter and a word);
 * - a generic in quotes (`'sans-serif'`) is a family named so, and a
 *   family the editor does not know that is a typo of a generic
 *   (`sansserif`, `serf`, `system ui`) is that generic;
 * - with `presets` (the font dial), a lone family that is a typo of a
 *   preset (`sytem`, `robto`) is that preset.
 * Only weight, style and size words (`16px bold`, `italic bold`) are a font
 * shorthand, read where the font dial reads one: null. `families` is the
 * list meant (empty when no family is left), `rung` the headings weight
 * nearest a weight given, `textSize` the text-size a size reads as, and
 * `style` a style given.
 * @param {string} value
 * @param {any} ctx
 * @param {boolean} [presets] whether a preset name is read (the font dial)
 * @param {Array<{name: string, near: string, rung?: string, words?: string}>} [notes] filled with each family kept as
 *   typed that is near a font a system ships (a family the editor does not
 *   know may be a real one: Corben is no typo of Corbel), or whose last
 *   words name a weight or style (`words`: Bodoni Moda Bold)
 * @returns {{why: string, families: string, asTyped: string | null, rung: string | null, size: boolean, textSize: number | null, style: string | null} | null}
 */
function fontListProblem(value, ctx, presets = false, notes = []) {
  // Copy debris (a trailing `;`, `!important`, a comment) is read away
  // first, as it is for any value.
  const pieces = familyPieces(withoutCopyDebris(pastedFont(value) ?? value));
  if (!pieces) return null;
  const weightOf = (/** @type {string} */ w) => {
    const k = w.toLowerCase().replace(/[\s_-]+/g, '');
    // A weight number is a whole hundred (Source Serif 4 is a family).
    return /^\d{3,4}$/.test(k) && Number(k) % 100 === 0 && Number(k) <= 1000
      ? Number(k)
      : HEADING_WEIGHTS[k] !== undefined
        ? Number(HEADING_WEIGHTS[k])
        : WEIGHT_WORDS[k] !== undefined
          ? Number(WEIGHT_WORDS[k])
          : null;
  };
  const STYLE = /^(italic|oblique)$/i;
  /** The one weight or style word a typo is near, else null. @param {string} w */
  const wordTypo = w => {
    // A word the editor knows as itself (tight is a headings tracking
    // word, as in Inter Tight) is no typo of another word.
    if (HEADING_TRACKING[w.toLowerCase()] !== undefined) return null;
    // A typo keeps the word's first letter: another first letter makes
    // another word (Night, Right and Tight are no typos of light).
    // A weight number typed with a letter O for a zero (6OO) is that number.
    if (/^\d[\dOo]{2,3}$/.test(w) && /[Oo]/.test(w)) {
      const n = w.replace(/[Oo]/g, '0');
      return weightOf(n) != null ? n : null;
    }
    const hits = [
      ...new Set(
        [
          ...Object.keys(HEADING_WEIGHTS),
          ...Object.keys(WEIGHT_WORDS),
          'italic',
          'oblique',
        ].filter(
          k =>
            /^[a-z]+$/.test(k) &&
            k[0] === w[0]?.toLowerCase() &&
            typoNear(w.toLowerCase(), k),
        ),
      ),
    ];
    return hits.length === 1 ? hits[0] : null;
  };
  const bare = (/** @type {string} */ w) =>
    w.toLowerCase().replace(/[\s_-]+/g, '');
  /** The family a preset key or a system family names, by lowercase name. */
  /** The family a preset key or a system family names. @param {string} k */
  const familyNamed = k => {
    const lower = k.toLowerCase();
    const named =
      FONTS[lower]?.[0] ??
      /** @type {Record<string, {family: string}>} */ (OPEN_FONTS)[lower]
        ?.family ??
      k;
    return named.replace(/["']/g, '');
  };
  /** That family, by lowercase name. @param {string} k */
  const familyOfKnown = k => bare(familyNamed(k));
  /** The generic a family the editor does not know is a typo of. */
  const genericOf = (/** @type {string} */ name) => {
    // Written with no dash or a space (sansserif, system ui): that generic.
    const exact = GENERIC_FAMILIES.find(g => bare(g) === bare(name));
    if (exact) return exact;
    const hits = GENERIC_FAMILIES.filter(g => typoNear(name.toLowerCase(), g));
    return hits.length === 1 ? hits[0] : null;
  };

  /** @type {string[]} */
  const kept = [];
  /**
   * Each family read as a misspelling, as typed in quotes: quotes keep a
   * family the editor does not know as written (Inder, Monaspace).
   * @type {Map<number, string>}
   */
  const asTyped = new Map();
  /** @type {number | null} */
  let weight = null;
  let number = false;
  let size = false;
  /** @type {string | null} */
  let sizeTyped = null;
  /** @type {string | null} */
  let style = null;
  let quotedGeneric = false;
  let misspelled = false;
  let joined = false;
  for (const p of pieces) {
    const name = p.name.trim();
    if (!name) continue;
    if (p.quoted) {
      if (GENERIC_FAMILIES.includes(name.toLowerCase())) {
        quotedGeneric = true;
        kept.push(name.toLowerCase());
      } else kept.push(/[^a-z0-9-]/i.test(name) ? JSON.stringify(name) : name);
      continue;
    }
    // A number or size alone is read where the setting reads one (a
    // size for text-size, a weight for headings); in a list of several it
    // is a family that is not one.
    if (NUMBERISH.test(name)) {
      if (pieces.length < 2) return null;
      if (/[a-z%]$/i.test(name)) {
        size = true;
        sizeTyped ??= name;
      } else if (weightOf(name) != null) weight ??= weightOf(name);
      else number = true;
      continue;
    }
    // A preset named by its key on the font dial (dm-sans, mono) is that
    // preset.
    const PRESETS = [...Object.keys(FONTS), ...Object.keys(OPEN_FONTS)];
    if (presets && PRESETS.includes(name.toLowerCase())) {
      kept.push(name);
      continue;
    }
    // A family the editor knows is that family, whatever its last word
    // (Arial Black, Source Serif 4).
    if (knownFamily(ctx, name)) {
      kept.push(name);
      continue;
    }
    // Two or more families the editor knows with no comma between them
    // (Georgia Verdana): the browser reads one family named that, which no
    // system has. Read as the list, with the name kept as typed in quotes.
    const run = knownFamilyRun(name);
    if (run) {
      joined = true;
      for (const [i, family] of run.entries()) {
        kept.push(family);
        asTyped.set(kept.length - 1, i === 0 ? JSON.stringify(name) : '');
      }
      continue;
    }
    // Weight, style, size and number words after the name, read from the
    // end; a weight of two words (extra bold) first.
    let words = name.split(/\s+/);
    /** @type {Array<{kind: string, text: string, value?: number, typo?: boolean}>} */
    const tail = [];
    // A weight or style word before a family the editor knows (700 Inter,
    // bold Inter, italic Georgia), as CSS's font shorthand writes them, is
    // that word too: read from the start while what is left is that family.
    {
      let start = 0;
      while (start < words.length - 1) {
        const w = words[start];
        const n = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(w)
          ? Number(w)
          : null;
        const lead =
          n != null && n >= 1 && n <= 1000
            ? {kind: 'weight', text: w, value: n}
            : STYLE.test(w)
              ? {kind: 'style', text: w.toLowerCase()}
              : n == null && weightOf(w) != null
                ? {kind: 'weight', text: w, value: Number(weightOf(w))}
                : null;
        if (!lead) break;
        const rest = words.slice(start + 1);
        if (
          !knownFamily(ctx, rest.join(' ')) &&
          !knownFamily(
            ctx,
            rest.filter(x => !weightOf(x) && !STYLE.test(x)).join(' '),
          )
        )
          break;
        tail.push(lead);
        start += 1;
      }
      words = words.slice(start);
    }
    let end = words.length;
    /**
     * Whether the words before index k, past any more weight or style
     * words (typed exactly or with a typo), are a family the editor knows
     * (Inter in `Inter Bold Itallic`).
     * @param {number} k
     */
    const familyBefore = k => {
      let i = k;
      while (
        i > 1 &&
        (weightOf(words[i - 1]) != null ||
          STYLE.test(words[i - 1]) ||
          wordTypo(words[i - 1]))
      )
        i -= 1;
      for (let j = k; j >= i; j -= 1)
        if (j > 0 && knownFamily(ctx, words.slice(0, j).join(' '))) return true;
      return false;
    };
    while (end > 0) {
      // A known family before the words read so far keeps its own last
      // word (Arial Black 900 is Arial Black and 900).
      if (end < words.length && knownFamily(ctx, words.slice(0, end).join(' ')))
        break;
      const two =
        end >= 2 ? weightOf(words.slice(end - 2, end).join('')) : null;
      const w = words[end - 1];
      if (two != null && end >= 3) {
        tail.unshift({
          kind: 'weight',
          text: words.slice(end - 2, end).join(' '),
          value: two,
        });
        end -= 2;
      } else if (STYLE.test(w)) {
        tail.unshift({kind: 'style', text: w.toLowerCase()});
        end -= 1;
      } else if (weightOf(w) != null) {
        tail.unshift({
          kind: 'weight',
          text: w,
          value: /** @type {number} */ (weightOf(w)),
        });
        end -= 1;
      } else if (NUMBERISH.test(w) && /[a-z%]$/i.test(w)) {
        tail.unshift({kind: 'size', text: w});
        end -= 1;
      } else if (
        end >= 2 &&
        /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/i.test(w) &&
        familyBefore(end - 1)
      ) {
        // A number after a family the editor knows, in any form CSS reads
        // (Inter 650, Inter 450.5, Inter +500, Inter 1e3), is no part of its
        // name: from 1 to 1000 a weight, the rung offered the nearest; any
        // other number (Inter 1500) a number where a family goes.
        const n = Number(w);
        tail.unshift(
          n >= 1 && n <= 1000
            ? {kind: 'weight', text: w, value: n}
            : {kind: 'number', text: w},
        );
        end -= 1;
      } else if (end >= 2 && wordTypo(w) && familyBefore(end - 1)) {
        // A weight or style word with a typo after a family the editor
        // knows (Georgia Blod) is that word: the one typo limit reads it.
        const meant = /** @type {string} */ (wordTypo(w));
        tail.unshift(
          STYLE.test(meant)
            ? {kind: 'style', text: meant, typo: true}
            : {
                kind: 'weight',
                text: meant,
                value: /** @type {number} */ (weightOf(meant)),
                typo: true,
              },
        );
        end -= 1;
        // A bare number that is no weight is part of the name (Source Sans
        // 3); only a separate list item is a number that is no family.
      } else break;
    }
    const base = words.slice(0, end).join(' ');
    // Only those words: alone, a font shorthand (read where the font dial
    // reads one); in a list of several, an item that is no family.
    if (!base) {
      if (pieces.length < 2) return null;
      for (const t of tail) {
        if (t.kind === 'weight') weight ??= t.value ?? null;
        else if (t.kind === 'style') style ??= t.text;
        else if (t.kind === 'size') {
          size = true;
          sizeTyped ??= t.text;
        }
      }
      continue;
    }
    /**
     * A family name read for a typo: of a generic, or (on the font dial,
     * alone) of a preset: that name; or of a font a system ships (arail
     * is Arial, Menol is Menlo), on any font list: one known-family rule.
     * Only a generic or a preset the editor offers is a typo (`editor`): a
     * family it does not know near a font a system ships may be a real
     * family (Corben, Gabriela), kept as typed, with a note.
     * @param {string} n
     */
    const typoOf = n => {
      const generic = genericOf(n);
      const known = [
        ...(presets && pieces.length === 1 ? PRESETS : []),
        ...systemFontFamilies(),
      ];
      const unknown = !generic && !isSystemFamily(cssUnescape(n));
      /** The known names a typo is near. @param {string[]} names */
      const hitsIn = names =>
        unknown ? names.filter(k => typoNear(bare(n), bare(k))) : [];
      /** @param {string} k */
      const distance = k =>
        levenshteinDistance(bare(n), bare(k), 99, {swaps: true});
      /** The nearest spelling among names of one family, else null. @param {string[]} hits */
      const oneReading = hits =>
        hits.length && new Set(hits.map(familyOfKnown)).size === 1
          ? hits.reduce((best, hit) =>
              distance(hit) < distance(best) ? hit : best,
            )
          : null;
      // The presets are read first, alone or in a list: a typo of one
      // (Corier is courier, even beside Corbel) is that preset, offered at
      // the nearest spelling of the family it names (Segoe IU is Segoe UI).
      // A preset and the family it names are one reading. In a list, where
      // a preset's own word is no family, it is offered as its family.
      const presetHit = oneReading(presets ? hitsIn(PRESETS) : []);
      const presetWord = presetHit
        ? (oneReading(
            hitsIn(known).filter(
              h => familyOfKnown(h) === familyOfKnown(presetHit),
            ),
          ) ?? familyNamed(presetHit))
        : null;
      const editor = generic ?? presetWord;
      const near = presetWord ?? oneReading(hitsIn(known));
      return {editor, near};
    };
    if (!tail.length) {
      const {editor, near} = typoOf(name);
      if (editor) {
        misspelled = true;
        kept.push(editor);
        asTyped.set(kept.length - 1, JSON.stringify(name));
      } else {
        if (near) notes.push({name, near});
        kept.push(name);
      }
      continue;
    }
    // A name with words after it that no family the editor knows starts
    // with: the whole name and the family before the words are read for
    // a typo by the same rule (Arail Black is near Arial Black; Georiga
    // Bold is Georgia and a weight).
    if (!knownFamily(ctx, base)) {
      const whole = typoOf(name);
      if (whole.editor) {
        misspelled = true;
        kept.push(whole.editor);
        asTyped.set(kept.length - 1, JSON.stringify(name));
        continue;
      }
      if (whole.near) {
        notes.push({name, near: whole.near});
        kept.push(name);
        continue;
      }
      const head = typoOf(base);
      if (head.editor) {
        misspelled = true;
        for (const t of tail) {
          if (t.kind === 'weight') weight ??= t.value ?? null;
          else if (t.kind === 'style') style ??= t.text;
          else if (t.kind === 'size') {
            size = true;
            sizeTyped ??= t.text;
          } else number = true;
        }
        kept.push(head.editor);
        asTyped.set(kept.length - 1, JSON.stringify(name));
        continue;
      }
      if (head.near) {
        // The family near the name, and the weight its words name set the
        // way set takes it (Arail Bold: arial, and headings bold).
        const w = tail.find(t => t.kind === 'weight')?.value;
        notes.push({
          name,
          near: head.near,
          ...(w != null
            ? {
                rung: Object.entries(HEADING_WEIGHTS).reduce((a, b) =>
                  Math.abs(Number(b[1]) - w) < Math.abs(Number(a[1]) - w)
                    ? b
                    : a,
                )[0],
              }
            : {}),
        });
        kept.push(name);
        continue;
      }
    }
    // Words only (no number or size): part of the name unless the whole
    // name is unknown and a family the editor knows starts the name before
    // them (Inter Bold, Inter Tight Bold). A family it does not know may end
    // in such a word (Archivo Black), so its name is kept whole; a number is
    // no word of a family, so it is read as a weight after any name.
    const knownStart = base
      .split(/\s+/)
      .some((_, i, all) => knownFamily(ctx, all.slice(0, i + 1).join(' ')));
    if (
      tail.every(
        t =>
          t.kind === 'style' ||
          (t.kind === 'weight' && !/^[-+.\d]/.test(t.text)),
      ) &&
      !(!knownFamily(ctx, name) && knownStart)
    ) {
      // A family the editor does not know whose last words are a weight or
      // style (Bodoni Moda Bold) may be a real family (Archivo Black): kept
      // as typed, and said, with the lines for the family and its weight.
      if (!knownFamily(ctx, name)) {
        const w = tail.find(t => t.kind === 'weight')?.value;
        notes.push({
          name,
          near: base,
          words: tail.map(t => t.text).join(' '),
          ...(w != null
            ? {
                rung: Object.entries(HEADING_WEIGHTS).reduce((a, b) =>
                  Math.abs(Number(b[1]) - w) < Math.abs(Number(a[1]) - w)
                    ? b
                    : a,
                )[0],
              }
            : {}),
        });
      }
      kept.push(name);
      continue;
    }
    for (const t of tail) {
      if (t.kind === 'weight') weight ??= t.value ?? null;
      else if (t.kind === 'style') style ??= t.text;
      else if (t.kind === 'size') {
        size = true;
        sizeTyped ??= t.text;
      } else number = true;
    }
    kept.push(base);
    // A word read through a typo keeps the name as typed on offer too.
    // A word read through a typo keeps the name as typed on offer too;
    // with a style word, which no font line sets, it is answered as the
    // exact words are.
    if (tail.some(t => t.typo) && !tail.some(t => t.kind === 'style')) {
      misspelled = true;
      asTyped.set(kept.length - 1, JSON.stringify(name));
    }
  }
  if (
    weight == null &&
    !size &&
    !style &&
    !number &&
    !quotedGeneric &&
    !misspelled &&
    !joined
  )
    return null;
  const rung =
    weight != null
      ? Object.entries(HEADING_WEIGHTS).reduce((a, b) =>
          Math.abs(Number(b[1]) - weight) < Math.abs(Number(a[1]) - weight)
            ? b
            : a,
        )[0]
      : null;
  return {
    why:
      weight != null
        ? 'holds a weight where a family goes, so the browser reads it as a family named that and falls back'
        : size
          ? 'holds a size where a family goes, so the browser reads it as a family named that and falls back'
          : style
            ? 'holds a style where a family goes, so the browser reads it as a family named that and falls back'
            : number
              ? 'holds a number where a family goes (a weight is a number from 1 to 1000, a size has a unit), so the browser reads it as a family named that and falls back'
              : quotedGeneric
                ? 'quotes a generic family, which makes it a family named that, so there is no generic to fall back to'
                : joined && !misspelled
                  ? 'names families the editor knows with no comma between them, so the browser reads one family named that, which no system has; a family the editor does not know is kept as written when it is quoted'
                  : 'is near a generic family or font the editor knows; a family the editor does not know is kept as written when it is quoted',
    families: kept.join(', '),
    asTyped:
      misspelled || joined
        ? kept
            .map((k, i) => asTyped.get(i) ?? k)
            .filter(Boolean)
            .join(', ')
        : null,
    rung,
    size,
    textSize: sizeTyped ? textSizePx(sizeTyped) : null,
    style,
  };
}

/**
 * A mode's label before a value, in any spelling: `dark mode:`, `darkmode:`,
 * `dark-mode:`, `mode dark:` (group 1 or 2 the mode, group 3 the value).
 */
const MODE_LABEL =
  /^\s*\{?\s*["']?(?:(light|dark)[\s_-]*mode|mode[\s_-]*(light|dark))["']?\s*[:=]\s*(.+?)\s*;?\s*\}?\s*$/i;

/**
 * The font list a value with a missing comma or a spaced generic means
 * (`Georgia serif` is `Georgia, serif`, `Inter, sans serif` is `Inter,
 * sans-serif`), with why; null when it has neither. A generic is read only
 * in lower case, so a family named `Source Serif` stays one name.
 * @param {string} value
 * @returns {{value: string, why: string} | null}
 */
export function fontListMeant(value) {
  const v = String(value).trim();
  // A whole list in one pair of quotes or brackets (`"Inter, serif"`,
  // `「Inter, serif」`): the quotes go around one family, so the list is
  // what is inside.
  const wrapped =
    /^(?:"([^"]*,[^"]*)"|'([^']*,[^']*)'|「([^」]*,[^」]*)」|『([^』]*,[^』]*)』|“([^”]*,[^”]*)”|‘([^’]*,[^’]*)’|«([^»]*,[^»]*)»)$/.exec(
      v,
    );
  if (wrapped) {
    const inside = wrapped.slice(1).find(x => x != null) ?? '';
    return {
      value: (fontListMeant(inside)?.value ?? inside).trim(),
      why: 'quotes go around one family name, not the whole list',
    };
  }
  if (/["']/.test(v)) return null;
  // Families split by `|`, `;` or ` / ` instead of commas.
  if (
    // (A pasted declaration, `font-family: Georgia, serif;`, is read
    // elsewhere: a colon or a trailing `;` is no separator.)
    !/:|\.(woff2?|ttf|otf)\b/i.test(v) &&
    /\S\s*(?:\||;|\s\/\s)\s*\S/.test(v)
  ) {
    const list = v
      .split(/\s*(?:\||;|\s\/\s)\s*/)
      .map(x => x.trim())
      .filter(Boolean)
      .join(', ');
    if (list && list !== v)
      return {
        value: fontListMeant(list)?.value ?? list,
        why: 'families are separated by commas',
      };
  }
  if (/\bsans serif\b/.test(v) && !/\d/.test(v))
    return {
      value: v.replace(/\bsans serif\b/g, 'sans-serif'),
      why: 'the generic family is sans-serif, with a dash',
    };
  // A comma missing before the generic family of any family in the list
  // (`Inter, Georgia serif`), the names in any case (`georgia serif`).
  const SHORTHAND =
    /^(\d+(\.\d+)?(px|rem|em|pt|%)?|bold|bolder|lighter|normal|italic|oblique|small-caps)$/i;
  // A word of a family name: letters (a digit after the first word, as in
  // `Source Serif 4`), or a generic; never a shorthand's weight or size.
  const familyWord = (/** @type {string} */ w, /** @type {number} */ i) =>
    (/^[A-Za-z][A-Za-z0-9]*$/.test(w) && !SHORTHAND.test(w)) ||
    (i > 0 && /^\d+$/.test(w)) ||
    GENERIC_FAMILIES.includes(w);
  const pieces = v.split(/\s*,\s*/);
  let missing = false;
  const fixedPieces = pieces.map(piece => {
    const ws = piece.split(/\s+/);
    const end = ws[ws.length - 1];
    if (
      ws.length > 1 &&
      GENERIC_FAMILIES.includes(end) &&
      ws.slice(0, -1).every(familyWord)
    ) {
      missing = true;
      return `${ws.slice(0, -1).join(' ')}, ${end}`;
    }
    return piece;
  });
  if (missing && pieces.length > 1)
    return {
      value: fixedPieces.join(', '),
      why: 'a comma goes before each generic family',
    };
  if (v.includes(',')) return null;
  const words = v.split(/\s+/);
  const last = words[words.length - 1];
  // Only family names before it (capitalized words), never a font
  // shorthand's weight, style or size.
  if (
    words.length > 1 &&
    GENERIC_FAMILIES.includes(last) &&
    words.slice(0, -1).every(familyWord)
  )
    return {
      value: `${words.slice(0, -1).join(' ')}, ${last}`,
      why: `a comma goes before the generic family ${last}`,
    };
  return null;
}

/**
 * A value of a type to put in a suggestion, so a suggested command runs.
 * @param {string} type
 * @param {string} name
 */
export function exampleOf(type, name) {
  return (
    {
      color: '#1f2937',
      size: '6px',
      number: /weight/.test(name) ? '600' : '1.4',
      time: '150ms',
      easing: 'cubic-bezier(0.2, 0, 0, 1)',
      font: 'Inter, sans-serif',
      shadow: '0 2px 4px rgb(0 0 0 / 0.2)',
    }[type] ?? (/style/.test(name) ? 'solid' : '0')
  );
}

/**
 * The value type a CSS property takes, for an example value.
 * @param {string} prop
 */
function groupOfPropType(prop) {
  if (COLOR_PROPS.test(prop)) return 'color';
  if (/shadow/.test(prop)) return 'shadow';
  if (/weight|line-height|opacity/.test(prop)) return 'number';
  if (/family/.test(prop)) return 'font';
  return 'size';
}

/**
 * Refuse a value that does not parse as the token's type.
 * @param {string} type @param {string} value @param {string} name
 * @param {Record<string, unknown>} TOKENS
 * @param {(token: string) => string} typeOf
 * @param {string} slug
 * @param {string[]} [readers] the CSS properties that read the token
 * @param {boolean} [multiplied] whether Core multiplies the token by a size
 * @param {boolean} [isSet] whether the theme sets the token now (an undo
 *   of it works)
 */
function checkTypedValue(
  type,
  value,
  name,
  TOKENS,
  typeOf,
  slug,
  readers = [],
  multiplied = false,
  isSet = true,
) {
  // The value meant, when what is wrong is how it was typed (a trailing
  // `;`, a comment, quotes around it, full-width characters, a font name
  // that needs quotes): the same value, if the token takes it.
  const meant = () => {
    for (const c of valueMeant(type, value))
      try {
        checkTypedValue(
          type,
          c,
          name,
          TOKENS,
          typeOf,
          slug,
          readers,
          multiplied,
        );
        return c;
      } catch {
        // Not this one.
      }
    return null;
  };
  /** @param {string} what @param {string | null} example */
  const bad = (what, example) =>
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${name} is ${what}; "${value}" is not one.`,
      {
        // Nothing read from the value (no example given): how, never a
        // stock value.
        run: [
          (meant() ?? example) == null
            ? `${HOW} ${name}`
            : `${P} set ${slug} ${name} ${quoteCommandArgument(String(meant() ?? example))}`,
        ],
      },
    );
  // A font family list with a comma missing before a generic family
  // (`Georgia serif`), or a generic written with a space (`sans serif`): the
  // list meant.
  if (type === 'font') {
    const fixed = fontListMeant(value);
    if (fixed)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${value}" names a family that exists nowhere: ${fixed.why}.`,
        {
          run: [
            `${P} set ${slug} ${name} ${quoteCommandArgument(fixed.value)}`,
          ],
        },
      );
  }
  // A font file or a link is no family name: never quoted into one.
  if (type === 'font') {
    const file = fontFileReason(pastedFont(value) || value);
    if (file)
      refuse(E.ERR_THEME_BAD_VALUE, file, {
        run: [
          `${P} set ${slug} ${name} ${quoteCommandArgument(exampleOf(type, name))}`,
        ],
      });
    // An empty family (`""`, a trailing comma) or one quoted name holding
    // commas is a broken stack: the browser drops the fallback after it.
    const pieces = familyPieces(value);
    if (
      pieces &&
      (pieces.some(f => !f.name) ||
        pieces.some(f => f.quoted && f.name.includes(',')))
    )
      bad(
        'a font family list with a name for each family',
        exampleOf(type, name),
      );
  }
  if (!isSafeValue(value))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${value}" cannot be a CSS value: ${UNSAFE_VALUE}.${/!\s*important/i.test(value) ? ' !important is not used: the theme places its own rules.' : ''}`,
      {
        run: [
          `${P} set ${slug} ${name} ${quoteCommandArgument(meant() ?? exampleOf(type, name))}`,
        ],
      },
    );
  // A CSS-wide keyword on a token is no value: whatever reads the token
  // gets none, and drops its declaration (a font list falls back to the
  // browser's default font). On a part property it keeps its meaning.
  const keyword = value
    .split(',')
    .map(x => x.trim().toLowerCase())
    .find(x => CSS_WIDE.includes(x));
  if (keyword)
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${keyword}" is a CSS keyword, not a value: on ${name} it leaves the token empty, so what reads it drops its style. Give a ${type} value${isSet ? `, or undo ${name} to go back to the base theme's` : ''}.`,
      {
        // How for the token; the undo only when the theme sets it.
        run: [
          `${HOW} ${name}`,
          ...(isSet ? [`${P} undo ${slug} ${name}`] : []),
        ],
      },
    );
  // Math whose units cannot combine (`8 + 2px`, `0.5rem * 1px`, a var()
  // read as its fallback): the browser drops the whole value.
  const math = type === 'size' ? calcUnitProblem(value) : null;
  if (math)
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${name} is a ${type}; the calc() in "${value}" cannot be worked out: ${math} (with each var() at its fallback, as when the variable is unset), so the browser drops the value.`,
      {run: [`${HOW} ${name}`]},
    );
  // A var() inside a larger value (calc, max, color-mix) has a fallback of
  // the token's kind too, checked like a whole-value var().
  if (type !== 'other')
    for (const {fallback, within} of innerVarFallbacks(value)) {
      // Inside a color's channels (rgb(var(--r, 0) 0 0)) a fallback is a
      // channel, not a color.
      if (
        type === 'color' &&
        within.some(f =>
          /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i.test(f),
        )
      )
        continue;
      // A factor in a size's math (`calc(0.75rem * var(--x, 1))`, as the
      // official themes write their type scale): a plain number there is
      // what multiplies the size.
      if (
        type === 'size' &&
        within.some(f => /^(calc|min|max|clamp)$/i.test(f)) &&
        /^[+-]?(\d+\.?\d*|\.\d+)$/.test(fallback.trim()) &&
        (/[*/]\s*var\(/i.test(value) || /var\([^()]*\)\s*[*/]/i.test(value))
      )
        continue;
      if (fallback === '')
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${name} is a ${type}; the var() in "${value}" has an empty fallback, which leaves it with no value when the variable is unset.`,
          {
            run: [
              `${P} set ${slug} ${name} ${quoteCommandArgument(exampleOf(type, name))}`,
            ],
          },
        );
      if (!/\bvar\(/i.test(fallback) && !/^[a-z-]+\(/i.test(fallback))
        checkTypedValue(
          type,
          fallback,
          name,
          TOKENS,
          typeOf,
          slug,
          readers,
          multiplied,
        );
    }
  // A var() naming a design token must name one of the same kind; the
  // app's own variables are its business.
  const ref = new RegExp(
    String.raw`^var\(\s*(${CUSTOM_PROPERTY})\s*(,.*)?\)$`,
    'i',
  ).exec(value.trim());
  if (ref) {
    if (ref[1] in TOKENS && typeOf(ref[1]) !== type && type !== 'other')
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${name} is a ${type}; ${ref[1]} is a ${typeOf(ref[1])}.`,
        {
          run: [
            `${HOW} --list tokens ${name.replace(/^--/, '').split('-')[0]}`,
          ],
        },
      );
    // The fallback is what shows when the variable is unset: it must be a
    // value of the token's kind too.
    const fallback = ref[2]?.slice(1).trim();
    if (fallback === '' && type !== 'other')
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${name} is a ${type}; "${value}" has an empty fallback, which leaves it with no value when the variable is unset.`,
        {
          run: [
            `${P} set ${slug} ${name} ${quoteCommandArgument(exampleOf(type, name))}`,
          ],
        },
      );
    if (fallback)
      checkTypedValue(
        type,
        fallback,
        name,
        TOKENS,
        typeOf,
        slug,
        readers,
        multiplied,
      );
    return;
  }
  // A var() naming a design token inside a function or a list
  // (`color-mix(in srgb, var(--radius-element) 50%, red)`, `calc(var(--x) *
  // 2)`, `0 1px 2px var(--spacing-4)`): the value read with an example of
  // that token's kind must still be this token's kind. It is refused when
  // an example of another kind would be, which names the kind the place
  // takes.
  if (type !== 'other') {
    /** @param {string} sample */
    const holds = sample => {
      try {
        checkTypedValue(
          type,
          sample,
          name,
          TOKENS,
          typeOf,
          slug,
          readers,
          multiplied,
        );
        return true;
      } catch {
        return false;
      }
    };
    /** One design token of each kind, for an example of that kind. @type {Map<string, string>} */
    const ofKind = new Map();
    for (const t of Object.keys(TOKENS)) {
      const k = typeOf(t);
      if (k !== 'other' && !ofKind.has(k)) ofKind.set(k, t);
    }
    for (const m of value.matchAll(
      new RegExp(
        String.raw`var\(\s*(${CUSTOM_PROPERTY})\s*(?:,[^()]*)?\)`,
        'gi',
      ),
    )) {
      const token = m[1];
      if (!(token in TOKENS)) continue;
      const kind = typeOf(token);
      if (kind === 'other' || kind === type) continue;
      if (holds(value.replace(m[0], exampleOf(kind, token)))) continue;
      const takes = [...ofKind].find(
        ([k, t]) => k !== kind && holds(value.replace(m[0], exampleOf(k, t))),
      )?.[0];
      if (takes)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${name} is a ${type}; in "${value}", ${token} sits where a ${takes} goes, and ${token} is a ${kind}, so the browser would drop the value.`,
          {
            run: [`${HOW} --list tokens ${takes}`],
          },
        );
    }
  }
  if (type === 'color' && !isFixedColor(value)) bad('a color', null);
  if (type === 'size' && !isSize(value, name)) {
    // The token's own default is never offered as a repair: only a size
    // read from the value typed.
    const sizeExample = null;
    // The size meant, when one dot or sign is all that is wrong (1.px).
    const meant = value.trim().replace(/(\d)\.(?=[a-z%]|$)/gi, '$1');
    // A bare number is the size in px; a minus sign is kept (a negative
    // size is refused, never offered as its positive).
    const plain = value.trim();
    // A bare number below one (a pasted `--radius: 0.5rem` that lost its
    // unit) has no unit to read it by: no size is guessed, as corners does.
    const px = /^[+]?\d*\.?\d+(e[+-]?\d+)?$/i.test(plain)
      ? Number(plain) > 0 && Number(plain) < 1
        ? null
        : `${Number(plain)}px`
      : /^\d*\.?\d+[a-z%]+$/i.test(plain) && plain !== value.trim()
        ? plain
        : null;
    const slip = sizeMeant(value, x => isSize(x, name));
    bad(
      'a size',
      meant !== value.trim() && isSize(meant, name)
        ? meant
        : px && isSize(px, name)
          ? px
          : (slip ?? sizeExample),
    );
  }
  // A percentage reaches every property that reads the token; one that
  // takes none (a border or outline width, an outline offset) drops it.
  if (type === 'size' && /%/.test(value.replace(/var\([^)]*\)/g, ''))) {
    const strict = readers.filter(p => !takesPercentage(p));
    if (strict.length)
      bad(
        `a length with no percentage (${strict.slice(0, 3).join(', ')} read${strict.length === 1 ? 's' : ''} it, and take${strict.length === 1 ? 's' : ''} none)`,
        '1px',
      );
  }
  if (type === 'number' && !isNumber(value, name))
    bad(
      'a number',
      numberMeant(value, name, x => isNumber(x, name)) ??
        (/weight/.test(name) ? '600' : '1.4'),
    );
  // A token Core's stylesheet multiplies by a size inside calc() (the line
  // heights) takes a number with no unit: there a length, a percentage or
  // normal is invalid.
  const coreDefault = String(TOKENS[name] ?? '').trim();
  const v0 = value.trim();
  const read = cssNumber(v0);
  if (
    type === 'number' &&
    multiplied &&
    !LONE_VAR.test(v0) &&
    read?.unit !== '' &&
    !(MATH_FUNCTION.test(v0) && matchType('number', v0) != null)
  ) {
    const unitless =
      read?.unit === 'em'
        ? String(read.value)
        : read?.unit === '%'
          ? String(read.value / 100)
          : coreDefault;
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${name} takes a number with no unit: Core multiplies it by a text size inside calc() (field heights, dialog headers, code blocks), where "${value}" is invalid. ${unitless === coreDefault ? `Core's own value is ${coreDefault}.` : `${unitless} is the same line height as a number.`}`,
      {
        run: [`${P} set ${slug} ${name} ${quoteCommandArgument(unitless)}`],
      },
    );
  }
  if (type === 'time' && !isTime(value)) bad('a time up to 60s', '150ms');
  if (type === 'easing' && !isEasing(value))
    bad('an easing', 'cubic-bezier(0.2, 0, 0, 1)');
  if (type === 'font' && !isFamilyList(value))
    bad('a font family list', 'Inter, sans-serif');
  if (type === 'shadow' && !isShadow(value))
    bad('a shadow', '0 2px 4px rgb(0 0 0 / 0.2)');
  if (
    /^--focus-outline-style$/.test(name) &&
    !matchValue('outline-style', value.trim())
  )
    bad('an outline style', 'solid');
}

/**
 * Whether a value is a color that works on its own and inside
 * `light-dark()`: a color this editor can read, or one of the color
 * functions and keywords it cannot read but CSS can; never a CSS-wide
 * keyword or a function with broken insides.
 * @param {string} value
 * @returns {boolean}
 */
function isFixedColor(value) {
  const v = value.trim().toLowerCase();
  if (CSS_WIDE.includes(v)) return false;
  if (/^var\(/.test(v)) return true;
  if (SYSTEM_COLORS.includes(v)) return true;
  // Percentages that add up to 0 leave color-mix() no color.
  // A share is 0% to 100%.
  const zeroMix = (/** @type {string[]} */ colors) => {
    const pcts = colors.map(c => mixSide(c).pct);
    return (
      pcts.some(p => p != null && (p < 0 || p > 100)) ||
      (pcts.every(p => p != null) && pcts.every(p => p === 0))
    );
  };
  const inner = (/** @type {string} */ fn) =>
    splitTop(v.slice(fn.length + 1, -1), ',').map(x => x.trim());
  // Each mode's value, and each mixed color, must be a color itself.
  if (/^light-dark\(.*\)$/.test(v)) {
    const args = inner('light-dark');
    return args.length === 2 && args.every(isFixedColor);
  }
  if (/^color-mix\(.*\)$/.test(v)) {
    const [space, ...colors] = inner('color-mix');
    return (
      /^in\s+[a-z-]+/.test(space ?? '') &&
      colors.length === 2 &&
      !zeroMix(colors) &&
      colors.every(c => isFixedColor(mixSide(c).color))
    );
  }
  if (!isColorValue(v)) return false;
  // A relative color is read by the browser (the grammar the editor reads
  // does not know it); channels with math or variables must still read as
  // a color, typed as the browser types them.
  if (/\bfrom\b/.test(v)) return true;
  if (MATH_FUNCTION.test(v) || /\b(var|env)\(/.test(v))
    return matchType('color', v) != null;
  if (/^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch)\(/.test(v))
    return parseColor(v) != null;
  if (/^color\(/.test(v))
    return /^color\((srgb|srgb-linear|display-p3|a98-rgb|prophoto-rgb|rec2020|xyz|xyz-d50|xyz-d65)\s/.test(
      v,
    );
  return true;
}

/** CSS system colors, which the browser resolves. */
const SYSTEM_COLORS = [
  'canvas',
  'canvastext',
  'linktext',
  'visitedtext',
  'activetext',
  'buttonface',
  'buttontext',
  'buttonborder',
  'field',
  'fieldtext',
  'highlight',
  'highlighttext',
  'selecteditem',
  'selecteditemtext',
  'mark',
  'marktext',
  'graytext',
  'accentcolor',
  'accentcolortext',
];

/**
 * Whether a value is a time the browser takes, at most a minute and never
 * negative (the grammar has no range).
 * @param {string} value
 */
function isTime(value) {
  const ast = matchType('time', value.trim());
  return (
    ast != null &&
    numbersIn(ast).every(
      n =>
        !['s', 'ms'].includes(n.unit) ||
        (n.value >= 0 && n.value * (n.unit === 's' ? 1000 : 1) <= 60_000),
    )
  );
}

/**
 * Whether a value is an easing the browser takes. The grammar has no range
 * for a step count: steps() needs at least one step, and two with
 * `jump-none`.
 * @param {string} value
 */
function isEasing(value) {
  const ast = matchType('easing-function', value.trim());
  if (!ast) return false;
  const count = numbersIn(ast).find(n => n.fn === 'steps');
  return !count || count.value >= (/jump-none/i.test(value) ? 2 : 1);
}

/** Whether a value is a font family list. @param {string} value */
const isFamilyList = value => matchValue('font-family', value.trim()) != null;

/**
 * Whether a value is a shadow list. The grammar has no range for the blur
 * (the third length), which is never negative.
 * @param {string} value
 */
function isShadow(value) {
  if (!matchValue('box-shadow', value.trim())) return false;
  return splitTop(value.trim(), ',').every(layer => {
    const lengths = splitTop(layer.trim(), ' ').filter(w =>
      /^[+-]?\d*\.?\d+[a-z]*$/i.test(w),
    );
    return !(lengths[2] ?? '').startsWith('-');
  });
}

/**
 * Refuse a value that would read the token itself, through other tokens.
 * A token set on a part (`--on`) overrides only inside that part: there
 * it reads the part's own settings first and the whole theme's after, and
 * a whole-theme value never reads a part's. So a loop counts only when it
 * closes within one scope: a part token that reads a whole-theme token
 * reads the inherited value, which is already resolved.
 * @param {string} thing
 * @param {string} value
 * @param {Record<string, unknown>} TOKENS
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} [cwd] the project, whose `<slug>.theme.ts` tokens win
 *   over the settings and are read too
 * @param {{on?: string, state?: string, when?: string}} [scope] where
 *   the token is set; none for the whole theme
 * @param {Record<string, unknown>} [element] the custom properties set on
 *   the element the token is set on, when that is not the theme's root (a
 *   surface's own tokens): only these are followed
 */
function checkCycle(
  thing,
  value,
  TOKENS,
  data,
  cwd,
  scope = {},
  element = undefined,
) {
  const own = cwd ? ownSourceTokenValues(cwd, data.name) : {};
  // The base theme's own values come under the settings: a base that maps
  // one token to another closes a loop too.
  const baseTokens = cwd ? baseTopTokens(cwd, data.like) : new Map();
  const on = scope.on ?? null;
  const settings = [...data.settings].reverse();
  /**
   * The token's value set on the part, or undefined: a setting with the
   * same state and variant wins over the part's plain one.
   * @param {string} t
   */
  const partValue = t => {
    if (on == null) return undefined;
    const onPart = settings.filter(
      s => s.source === 'token' && s.thing === t && s.on === on,
    );
    const same = onPart.find(
      s =>
        (s.state ?? null) === (scope.state ?? null) &&
        (s.when ?? null) === (scope.when ?? null),
    );
    const set = (same ?? onPart.find(s => s.state == null && s.when == null))
      ?.value;
    if (set !== undefined) return set;
    // Else what the part's plain rule holds as built: the own source's and
    // the base theme's part rules (neutral's progress-bar reads
    // --color-border-emphasized).
    // A state or variant rule of the part inherits its plain rule.
    if (!cwd) return undefined;
    const rule = partRule().get(t);
    return rule ?? undefined;
  };
  /** @type {Map<string, string | null> | null} */
  let rule = null;
  const partRule = () =>
    (rule ??= on
      ? partRuleTokens(/** @type {string} */ (cwd), data.name, data.like, on)
      : new Map());
  // A custom property's var() resolves on the element that sets it, so on
  // a surface only what that surface sets can loop back; a value from the
  // page is inherited as it already resolved there.
  /** @param {string} t */
  const globalValue = t =>
    element
      ? String(Object.hasOwn(element, t) ? (element[t] ?? '') : '')
      : String(
          (Object.hasOwn(own, t) ? own[t] : null) ??
            settings.find(s => s.source === 'token' && s.thing === t && !s.on)
              ?.value ??
            baseTokens.get(t) ??
            TOKENS[t] ??
            '',
        );
  const refs = (/** @type {string} */ v) =>
    [
      ...v.matchAll(new RegExp(String.raw`var\(\s*(${CUSTOM_PROPERTY})`, 'gi')),
    ].map(m => m[1]);
  /** @type {string[]} */
  const path = [];
  const seen = new Set();
  /**
   * Whether `t`, read in the part (`inPart`) or the whole theme, reaches
   * the token being set in its own scope.
   * @param {string} t @param {boolean} inPart @returns {boolean}
   */
  const reaches = (t, inPart) => {
    // The token being set is reached only in the scope it is set in.
    if (t === thing && inPart === (on != null)) return true;
    const part = inPart ? partValue(t) : undefined;
    const local = part !== undefined;
    const key = `${local ? 'part' : 'theme'}:${t}`;
    if (seen.has(key)) return false;
    seen.add(key);
    path.push(
      local
        ? `${t} (on ${on})`
        : Object.hasOwn(own, t)
          ? `${t} (set in ${data.name}.theme.ts)`
          : t,
    );
    if (
      refs(local ? String(part) : globalValue(t)).some(r => reaches(r, local))
    )
      return true;
    path.pop();
    return false;
  };
  if (refs(value).some(r => reaches(r, on != null)))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `${thing} would read itself${path.length ? ` through ${path.join(', ')}` : ''}, so it would have no value at all.`,
      {
        run: [
          `${P} set ${data.name} ${thing} <a value that does not read ${thing}>${on != null ? ` --on ${on}` : ''}`,
        ],
      },
    );
}

/**
 * The color a value typed as one most likely meant: a comma rgb() or hsl()
 * CSS does not take as written, in the syntax CSS reads its channels in
 * (`hsl(0, 100, 50)` is `hsl(0 100 50)`), else the CSS color name nearest a
 * word (`banan` is not one, `rd` is red); null when none is near.
 * @param {string} v
 */
function nearestColorName(v) {
  const asRead = colorAsCssReads(v);
  if (asRead) return asRead;
  const w = v.trim().toLowerCase();
  if (!/^[a-z]+$/.test(w)) return null;
  return nearest(w, COLOR_NAMES)[0] ?? null;
}

/**
 * Old keywords a property's grammar lists that no current browser applies,
 * each with the keyword that does what it meant.
 * @type {Record<string, Record<string, string>>}
 */
const OBSOLETE_KEYWORDS = {
  cursor: {hand: 'pointer'},
};
documentReadings(
  Object.values(OBSOLETE_KEYWORDS).flatMap(words => Object.entries(words)),
);

/**
 * Why a value is not one the property takes, or null. Colors are checked
 * by the editor's own color check; a property css-tree has no grammar for
 * is not checked.
 * @param {string} prop
 * @param {string} value
 * @returns {{takes: string, near: string | null} | null}
 */
function propertyProblem(prop, value) {
  const v = value.trim();
  const known = propertyGrammar(prop);
  if (!known || COLOR_PROPS.test(prop)) return null;
  // Each var() fallback is what shows when its variable is unset: the
  // value with the fallbacks in place must be one the property takes too.
  const unset = withFallbacks(v);
  if (unset != null && matchValue(prop, v) && !matchValue(prop, unset))
    return {
      takes: `a value its CSS grammar takes in each var() fallback too (${grammarText(known)})`,
      near: initialOf(prop),
    };
  // An old keyword the grammar still lists but no current browser
  // applies (`cursor: hand`): the keyword that does what it meant.
  const obsolete = OBSOLETE_KEYWORDS[prop]?.[v.toLowerCase()];
  if (obsolete)
    return {
      takes: `a value current browsers apply ("${v}" is an old keyword none applies; ${obsolete} does what it meant)`,
      near: obsolete,
    };
  if (matchValue(prop, v))
    return belowRange(prop, v)
      ? // A negative value is no size of the other sign: no line mirrors it.
        {takes: 'a value of 0 or more', near: null}
      : null;
  // The same value as it was meant to be typed (a font name quoted, a
  // trailing `;` gone), when the property takes that.
  const fixed = valueMeant(prop === 'font-family' ? 'font' : 'other', v).find(
    c => matchValue(prop, c),
  );
  if (fixed)
    return {
      takes: `a value its CSS grammar takes (${grammarText(known)})`,
      near: fixed,
    };
  // Only keywords the property takes on their own are offered; the same
  // word without its dashes or a trailing -ed/-s comes first (no-wrap is
  // nowrap, underlined is underline), then the nearest in spelling.
  const own = keywordsOf(prop).filter(k => matchValue(prop, k));
  const typed = v.toLowerCase();
  const bare = (/** @type {string} */ w) => w.replace(/[-\s]/g, '');
  const near = /^[a-z-]+$/i.test(v)
    ? (own.find(k => bare(k) === bare(typed)) ??
      own.find(k => typed.replace(/(ed|d|s)$/, '') === k) ??
      nearest(typed, own)[0] ??
      null)
    : null;
  // A value that works, for the suggestion: a keyword near the one typed,
  // or the value typed cleaned; each checked.
  // A bare number on a length property means px (`padding 4` → `4px`, each
  // number in a list too), when the property takes that.
  // Each bare number token gets px (a mixed list `4 8px`, `8 / 4`, an
  // exponent `1e1`), a unit split off by a space (`4 px`) joins its number.
  const joined = unitsJoined(v);
  const withPx = /\d/.test(joined)
    ? joined.replace(
        /(^|[\s/(,])([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(?=$|[\s/),])/gi,
        (_, pre, num) =>
          Number(num) === 0 ? `${pre}${num}` : `${pre}${num}px`,
      )
    : null;
  // A suggestion is offered only when the property takes it, in range too,
  // and never a reset the input did not hold (0, none, 1, auto, normal):
  // following it would undo what was asked. A reset typed with a typo
  // (`nnone`, `normall`: a word within two edits of it) is that reset,
  // corrected.
  const RESETS =
    /^(0|0px|none|1|auto|normal|initial|unset|inherit|revert|transparent)$/i;
  const typedAs = (/** @type {string} */ x) => x === typed || typoOf(typed, x);
  const takes = (/** @type {string | null} */ x) =>
    x != null &&
    matchValue(prop, x) != null &&
    !belowRange(prop, x) &&
    !(RESETS.test(x.trim()) && !typedAs(x.trim().toLowerCase()));
  // A lone length on a shorthand where it is only a position (background,
  // mask) wipes the rest: no px is guessed there.
  const pxFits = !/^(background|mask)$/i.test(prop);
  // Words with a documented reading on a property (the allowlist a repair
  // may map through).
  const WORDS = PROPERTY_WORDS;
  // A weight word is its number (the same table the headings dial reads);
  // text in content is that text, quoted.
  const weightWord = typed.replace(/[\s-]+/g, '');
  const weight = HEADING_WEIGHTS[weightWord] ?? WEIGHT_WORDS[weightWord];
  const mapped =
    WORDS[prop]?.[typed.replace(/\s+/g, '-')] ??
    (prop === 'font-weight' && weight ? weight : null) ??
    (prop === 'content' && !/^["']|["']$/.test(v) ? JSON.stringify(v) : null) ??
    null;
  return {
    takes: `a value its CSS grammar takes (${grammarText(known)})`,
    near:
      (mapped && matchValue(prop, mapped) != null ? mapped : null) ??
      (pxFits && takes(withPx) ? withPx : null) ??
      // Below the property's range (a negative width) is no size of the
      // other sign: the mirrored value is never offered.
      (takes(joined) && joined !== v ? joined : null) ??
      // A comma between two whole numbers of 1 or more that the grammar
      // pairs with a slash separates them (`aspect-ratio 16,9` is 16 / 9,
      // `grid-row 2,4` is 2 / 4), unless it reads as a decimal comma: written
      // tight after a 1 (`1,5`) or after one digit with two or more after it
      // (`1,78`, `2,35`), where the property takes that decimal. Any other
      // comma between digits (`0,75`) is a decimal comma.
      (() => {
        const pair = /^\s*([1-9]\d*)(\s*),(\s*)([1-9]\d*)\s*$/.exec(v);
        if (!pair) return null;
        const [, a, before, after, b] = pair;
        const decimal =
          !before &&
          !after &&
          (a === '1' || (a.length === 1 && b.length >= 2)) &&
          takes(`${a}.${b}`);
        return !decimal && takes(`${a} / ${b}`) ? `${a} / ${b}` : null;
      })() ??
      // A comma between digits is a decimal point (1,5rem is 1.5rem), never
      // a split into layers.
      // (A unit split off by a space joins it there too: `1,5 rem`.)
      (() => {
        const decimal = unitsJoined(commaNumbers(v, thousandsSetting(prop)));
        return takes(decimal) && decimal !== v ? decimal : null;
      })() ??
      // Several values of one kind on a property that takes one
      // (padding-top with four lengths): the first as typed, with px only
      // when the property takes no bare number. Never one value of a
      // shorthand of several kinds (`all 200` for transition). A property
      // whose grammar pairs them with a slash (`aspect-ratio 16 9`,
      // `grid-row 2 4`) takes the pair, never its first half.
      (() => {
        const all = splitTop(v.trim(), ' ');
        const slashed = all.join(' / ');
        if (all.length === 2 && takes(slashed)) return slashed;
        if (all.length > 1 && takes(all.slice(0, 2).join(' / '))) return null;
        const same = sameKindValues(v);
        if (!same) return null;
        const first = same.items[0];
        const px = same.kind === '' ? `${first}px` : null;
        return takes(first) ? first : pxFits && px && takes(px) ? px : null;
      })() ??
      (near && takes(near) ? near : null) ??
      // Layers typed with one too many or an empty one (`url(a.png), red,
      // blue`, `red,,blue`): the layers before the last, else one of them,
      // when the property takes it. Never the property's reset or a stock
      // example: a repair carries only what was typed.
      (() => {
        const layers = splitTop(v.trim(), ',')
          .map(x => x.trim())
          .filter(Boolean);
        if (layers.length < 2 && !/,\s*,/.test(v)) return null;
        const tries = [
          layers.join(', '),
          layers.slice(0, -1).join(', '),
          ...layers,
        ];
        return tries.find(x => x && x !== v && takes(x)) ?? null;
      })(),
  };
}

/** Words people use for a dial's values, by dial. */
const DIAL_WORDS = wordTable(
  /** @type {Record<string, Record<string, string>>} */ ({
    surfaces: {
      elevated: 'raised',
      elevation: 'raised',
      shadow: 'raised',
      shadows: 'raised',
      lifted: 'raised',
      frosted: 'glass',
      blur: 'glass',
      blurred: 'glass',
      translucent: 'glass',
      bordered: 'outlined',
      border: 'outlined',
      borders: 'outlined',
      lined: 'outlined',
      outline: 'outlined',
      plain: 'flat',
      minimal: 'flat',
    },
    buttons: {
      uppercase: 'caps',
      upper: 'caps',
      allcaps: 'caps',
      capitals: 'caps',
      tint: 'soft',
      tinted: 'soft',
      subtle: 'soft',
      outlined: 'outline',
      bordered: 'outline',
      ghost: 'outline',
      filled: 'solid',
      fill: 'solid',
    },
    mode: {
      auto: 'both',
      system: 'both',
      default: 'both',
      light: 'light-only',
      dark: 'dark-only',
    },
  }),
);

/**
/**
 * Whether the base theme's own part styles read a token (`var(--x)`), which
 * the editor's record of Core's parts does not cover.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} like
 * @param {string} token
 */
function baseReads(ctx, like, token) {
  try {
    return new RegExp(`var\\(${token}[,)]`).test(
      fs.readFileSync(baseThemeFile(ctx.project, like), 'utf8'),
    );
  } catch {
    return false;
  }
}

/**
 * The headings rung nearest a weight number (800 is heavy).
 * @param {number} weight
 */
const weightRung = weight =>
  Object.entries(HEADING_WEIGHTS).reduce((a, b) =>
    Math.abs(Number(b[1]) - weight) < Math.abs(Number(a[1]) - weight) ? b : a,
  )[0];
documentNumericTable(
  ['headings', 'font-weight'],
  Object.entries(HEADING_WEIGHTS).map(([w, n]) => [w, Number(n)]),
  [1, 1000],
);
// A font weight runs from 1 to 1000.
documentRange(['font-weight', '--font-weight-*'], 1, 1000);
documentNumericTable(
  ['spacing'],
  SPACING.map(([name, factor]) => [name, factor]),
);
documentNumericTable(
  ['text-size'],
  TEXT_SIZE.map(([name, px]) => [name, px]),
);
// The text size number is the body size in pixels, 10 to 32; vibrancy
// runs from 0 to 100.
documentRange(['text-size'], 10, 32);
documentRange(['vibrancy'], 0, 100);
documentReadings(TEXT_SIZE.map(([name, px]) => [name, `${px}px`]));
documentReadings(Object.entries(HEADING_TRACKING));
// `bold` given a no (false, off) is the normal weight.
documentReadings(['false', 'off', 'no', 'none'].map(w => [w, 'normal']));
/**
 * The CSS absolute-size keywords that are no text-size rung, as the px
 * CSS gives each at a 16px root.
 */
const CSS_SIZE_KEYWORDS = wordTable(
  /** @type {Record<string, number>} */ ({
    'xx-small': 9,
    'x-small': 10,
    'x-large': 24,
    'xx-large': 32,
    'xxx-large': 48,
  }),
);
documentReadings(
  Object.entries(CSS_SIZE_KEYWORDS)
    .filter(([, px]) => px >= 10 && px <= 32)
    .map(([w, px]) => [w, String(px)]),
);
// A weight word read as the headings rung its number is nearest.
documentReadings(
  Object.entries(WEIGHT_WORDS).map(([w, n]) => [w, weightRung(Number(n))]),
);
/** Words for no rounding: corners square. */
const NO_ROUNDING = ['0', '0%', 'none', 'sharp', 'zero', 'no', 'flat'];
/** Words for no space: spacing's tightest rung. */
const NO_SPACE = ['0', 'none', 'zero', 'no', 'off'];
documentReadings(NO_ROUNDING.map(w => [w, 'square']));
documentReadings(NO_SPACE.map(w => [w, SPACING[0][0]]));
documentReadings(
  Object.values(DIAL_WORDS).flatMap(words => Object.entries(words)),
);
/** State words a value may be labeled with. */
export const STATE_WORDS = [
  'hover',
  'active',
  'focus',
  'focus-visible',
  'focus-within',
  'disabled',
  'pressed',
  'selected',
  'highlighted',
  'checked',
  'open',
  'expanded',
  'visited',
];
/** Words for a kind of screen a value may be labeled with. */
const DEVICE_WORDS = [
  'phone',
  'phones',
  'mobile',
  'tablet',
  'tablets',
  'desktop',
  'laptop',
  'ipad',
  'iphone',
  'android',
  'ios',
  'touch',
  'small-screen',
  'small-screens',
  'large-screen',
  'large-screens',
  'print',
];

/**
 * The word a value is labeled with and the value after it (`dark: #2563eb`,
 * `"corners": "pill"`, `{"dark": "#2563eb"}`, `dark=#2563eb`, `dark mode:
 * #2563eb`, `textSize: 18`), the word as a dashed name; null when the value
 * holds no label.
 * @param {string} value
 * @returns {{word: string, rest: string, when?: string} | null}
 */
function valueLabel(value) {
  // A mode label in any spelling (`dark mode: red`, `darkmode: red`,
  // `mode dark: red`) is that mode's label: one reading, read first so the
  // value is never taken for the label.
  const modeLabel = MODE_LABEL.exec(String(value));
  if (modeLabel)
    return {
      word: (modeLabel[1] ?? modeLabel[2]).toLowerCase(),
      rest: modeLabel[3].trim(),
    };
  // A flag's label after the value (`red mode: dark`, `red state: hover`,
  // `red part: card`) reads as the same label before it (`dark: red`); a
  // variant or size after it (`red variant: primary`) keeps its prop.
  const trail =
    /^\s*(.+?)\s+(mode|theme|state|part|on|variant|size|when)\s*[:=]\s*([a-z][a-z0-9:-]*)\s*;?\s*$/i.exec(
      String(value),
    );
  if (trail && !/[:=]/.test(trail[1])) {
    const flag = trail[2].toLowerCase();
    const word = trail[3].toLowerCase();
    if (/^(variant|size|when)$/.test(flag))
      return {
        word: 'when',
        rest: trail[1].trim(),
        when: flag === 'when' ? word : `${flag}:${word}`,
      };
    return {word, rest: trail[1].trim()};
  }
  const m =
    /^\s*\{?\s*["']?([a-zA-Z][a-zA-Z0-9 _-]*?|--[a-z0-9-]+)["']?\s*[:=]\s*(.+?)\s*;?\s*\}?\s*$/.exec(
      String(value),
    );
  if (!m || /^https?$/i.test(m[1])) return null;
  const word = m[1]
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .toLowerCase();
  const rest = m[2].trim().replace(/^"(.*)"\s*,?$/, '$1');
  return {word, rest};
}

/**
 * Whether a label is the setting's own name (`accent: red` for accent,
 * `font-family: Inter` for font).
 * @param {string} thing @param {string} word
 */
const ownLabel = (thing, word) =>
  word === thing ||
  (thing === 'font' && word === 'font-family') ||
  (thing.startsWith('--font-family') &&
    (word === 'font-family' || word === 'font')) ||
  (thing === 'text-size' && word === 'font-size');

/**
 * The families the editor knows that a name is made of, written with no
 * comma between them (`Georgia Verdana`, `Times New Roman Arial`), longest
 * first at each word; null unless it is two or more of them. Only family
 * names count, never a preset's key: `Roboto Mono` is one family, not
 * Roboto and the mono preset.
 * @param {string} name
 * @returns {string[] | null}
 */
function knownFamilyRun(name) {
  const words = name.split(/\s+/).filter(Boolean);
  if (words.length < 2) return null;
  /** @param {string} span */
  const known = span =>
    isSystemFamily(span) ||
    [
      ...Object.values(OPEN_FONTS).map(f => f.family),
      ...Object.values(FONTS).map(f => f[0]),
    ].some(f => f.replace(/["']/g, '').toLowerCase() === span.toLowerCase());
  /** @type {string[]} */
  const out = [];
  let at = 0;
  while (at < words.length) {
    let end = words.length;
    while (end > at && !known(words.slice(at, end).join(' '))) end--;
    if (end === at) return null;
    out.push(words.slice(at, end).join(' '));
    at = end;
  }
  return out.length > 1 ? out : null;
}

/**
 * Whether a family is one the editor knows: a system family on the theme
 * build's list, an open font in its table or a preset's family, or one
 * whose @fontsource package the project has installed.
 * @param {any} ctx
 * @param {string} family without quotes
 */
function knownFamily(ctx, family) {
  const name = family.trim().toLowerCase();
  if (!name) return false;
  if (isSystemFamily(family)) return true;
  if (
    [
      ...Object.values(OPEN_FONTS).map(f => f.family),
      ...Object.values(FONTS).map(f => f[0]),
    ].some(f => f.toLowerCase() === name)
  )
    return true;
  try {
    ctx?.project?.req?.resolve(`${fontsourcePackageOf(family)}/package.json`);
    return Boolean(ctx?.project?.req);
  } catch {
    return false;
  }
}

/**
 * The CSS properties a dial sets, whose pasted declaration is the dial's
 * own value (`border-radius: 8px` for corners, `color: #e11d48` for a
 * color dial). A dial with none takes no pasted property.
 * @type {Record<string, (word: string) => boolean>}
 */
const DIAL_PROPERTIES = {
  corners: w => /^border(-[a-z]+)*-radius$/.test(w),
  spacing: w => /^(padding|margin|gap|row-gap|column-gap)(-[a-z]+)*$/.test(w),
  'text-size': w => w === 'font-size',
  font: w => w === 'font' || w === 'font-family',
  headings: w => w === 'font-weight' || w === 'letter-spacing',
  ...Object.fromEntries(
    PALETTE_DIALS.map(d => [
      d,
      (/** @type {string} */ w) => w === 'background' || COLOR_PROPS.test(w),
    ]),
  ),
};

/**
 * Whether a CSS property pasted before a value (`margin: 8px`) is one the
 * setting sets: its own label, a property a dial sets, a property that
 * reads the token, or, for a color token, a color property.
 * @param {any} ctx
 * @param {string} thing
 * @param {string} word
 * @param {boolean} partProperty
 */
function labelOwned(ctx, thing, word, partProperty) {
  if (word === thing || ownLabel(thing, word)) return true;
  if (partProperty) return false;
  if (DIALS[thing]) return DIAL_PROPERTIES[thing]?.(word) ?? false;
  if (thing.startsWith('--')) {
    const kebab = (/** @type {string} */ p) =>
      p.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
    return (
      (ctx?.C?.propsReading?.(thing) ?? []).some(
        (/** @type {string} */ p) => kebab(p) === word,
      ) ||
      (isColorToken(thing) && (word === 'background' || COLOR_PROPS.test(word)))
    );
  }
  return false;
}

/**
 * The one mode a light-only or dark-only theme shows, or null.
 * @param {{mode?: string} | null | undefined} data
 * @returns {'light' | 'dark' | null}
 */
function oneModeOfTheme(data) {
  return data?.mode === 'light-only'
    ? 'light'
    : data?.mode === 'dark-only'
      ? 'dark'
      : null;
}

/**
 * Whether any of the parts draws a line of that kind (a border, one side's
 * border, an outline) with a width, at rest or in the state named: then its
 * color alone can differ by mode.
 * @param {any} C the part census
 * @param {string[]} parts
 * @param {string} prop border, border-<side> or outline
 * @param {string | undefined | null} [state]
 * @returns {boolean}
 */
export function drawsLine(C, parts, prop, state) {
  // (A side's line is drawn by the side's own width or the shared one.)
  const keys =
    prop === 'border'
      ? [
          'border-width',
          ...['top', 'right', 'bottom', 'left'].map(x => `border-${x}-width`),
        ]
      : prop.startsWith('border-')
        ? [`${prop}-width`, 'border-width']
        : [`${prop}-width`];
  return parts.some(t => {
    const at = C.MAP[t]?.at ?? {};
    return keys.some(k =>
      Object.entries(at[k] ?? {}).some(
        ([sel, w]) =>
          !/^\s*0(?:px)?\s*$/.test(String(w)) &&
          (state ? sel.includes(state) : !/:/.test(sel)),
      ),
    );
  });
}

/**
 * Whether a part reads a token in any of its rules.
 * @param {any} C the part census
 * @param {string} part
 * @param {string} token
 */
function readsToken(C, part, token) {
  return Object.keys(GROUPS).some(g =>
    (C.partReads(part, g) ?? []).some(
      (/** @type {{token: string}} */ r) => r.token === token,
    ),
  );
}

/**
 * The radio marks (radioMark) whose circle the installed Core draws with
 * the pill token (--radius-full), not a knob inside a pill (a switch's
 * thumb goes with its switch); radioCircle reads a Core that draws it at
 * 50%. On such a Core, squaring the pills would
 * square the radios, which then read as checkboxes; the editor keeps the
 * token at Core's value on them. A Core that draws the circle at 50% gives
 * none, so this switches off by itself there.
 * Remove when the minimum supported @astryxdesign/core draws radio circles
 * at 50%.
 * @param {any} C the part census
 * @returns {string[]}
 */
export function pillDrawnRadios(C) {
  /** A radio's mark whose corners read --radius-full. @param {string} pt */
  const pillCircle = pt =>
    radioMark(C, pt) &&
    Object.values(C.MAP[pt]?.at?.['border-radius'] ?? {}).some(v =>
      /--radius-full/.test(String(v)),
    );
  /** Inside a pill that is no such mark (a switch's thumb). @param {string} pt */
  const inPill = pt =>
    Object.keys(C.MAP).some(
      p =>
        (C.MAP[p]?.contains ?? []).includes(pt) &&
        readsToken(C, p, '--radius-full') &&
        !pillCircle(p),
    );
  return Object.keys(C.MAP).filter(pt => pillCircle(pt) && !inPill(pt));
}

/**
 * The parts drawn as pills: they read --radius-full, which the corners
 * dial leaves round. A radio mark, and what it holds (its dot), is no pill.
 * @param {any} C the part census
 * @returns {string[]}
 */
export function pillParts(C) {
  const radios = new Set(
    pillDrawnRadios(C).flatMap(m => [m, ...(C.MAP[m]?.contains ?? [])]),
  );
  return Object.keys(C.MAP).filter(
    p => !radios.has(p) && readsToken(C, p, '--radius-full'),
  );
}

/**
 * The lines a part draws as an indicator, by the census: a part with no
 * parts inside and one side of a fixed size of a few pixels at rest, the
 * other following what it marks (no fixed size), that shows a state: its
 * fill only when selected (a tab's underline) or its length taken from an
 * anchor (an outline's bar). Each with the side that is its thickness.
 * @param {any} C the part census
 * @returns {Array<{part: string, side: 'height' | 'width'}>}
 */
export function indicatorLines(C) {
  /** @type {Array<{part: string, side: 'height' | 'width'}>} */
  const out = [];
  for (const pt of Object.keys(C.MAP)) {
    if ((C.MAP[pt]?.contains ?? []).length) continue;
    const fills = C.partReads(pt, 'background') ?? [];
    if (!fills.length) continue;
    const at = C.MAP[pt]?.at ?? {};
    const selectedOnly = fills.every((/** @type {{when: string[]}} */ r) =>
      r.when.every(w => /selected=selected/.test(w)),
    );
    const anchored = Object.values(at)
      .flatMap(v => Object.values(/** @type {Record<string, unknown>} */ (v)))
      .some(v => /anchor-size\(/.test(String(v)));
    if (!selectedOnly && !anchored) continue;
    /** @param {string} side */
    const fixedPx = side =>
      Object.entries(at[side] ?? {})
        .filter(([sel]) => !/:/.test(sel))
        .map(([, v]) => /^\s*(\d*\.?\d+)px\s*$/.exec(String(v))?.[1])
        .find(px => px != null);
    for (const side of /** @type {const} */ (['height', 'width'])) {
      const px = fixedPx(side);
      const other = fixedPx(side === 'height' ? 'width' : 'height');
      if (px != null && Number(px) > 0 && Number(px) <= 4 && other == null) {
        out.push({part: pt, side});
        break;
      }
    }
  }
  return out;
}

/**
 * The parts that draw a box only when selected (a nav item's or a
 * segment's fill in its selected state, none at rest) and no border: a
 * border for them goes on that state. An indicator line and a table row
 * (its cells draw the rules) are none.
 * @param {any} C the part census
 * @returns {string[]}
 */
export function selectedBoxes(C) {
  const lines = new Set(indicatorLines(C).map(x => x.part));
  const dividers = new Set(dividerParts(C));
  return Object.keys(C.MAP).filter(pt => {
    if (lines.has(pt)) return false;
    // A row of a table: its cells draw the rules between rows.
    if (
      (C.MAP[pt]?.contains ?? []).some((/** @type {string} */ c) =>
        dividers.has(c),
      )
    )
      return false;
    const fills = C.partReads(pt, 'background') ?? [];
    // A press or hover state written as an attribute is no resting fill.
    const atRest = fills.some((/** @type {{when: string[]}} */ r) =>
      r.when.some(w => !/:|selected|\[/.test(w)),
    );
    const selected = fills.some(
      (/** @type {{token: string, when: string[]}} */ r) =>
        /^--color-(?!overlay)/.test(r.token) &&
        r.when.some(w => /selected=selected/.test(w) && !/:/.test(w)),
    );
    const bordered = (C.partReads(pt, 'border') ?? []).some(
      (/** @type {{token: string}} */ r) =>
        r.token === '--border-width' || /^--color-border/.test(r.token),
    );
    return selected && !atRest && !bordered;
  });
}

/**
 * The surfaces whose border the shared border tokens never reach, as the
 * census reads them: the containers, menus and overlays (a part with an
 * elevation shadow, or one the layer runtime places: a tooltip), a framed
 * surface (container or element corners and a fill around other parts: a
 * banner, a segmented control), a label box (an inline box with a fill
 * and room around its label: a badge, a token), and every part that draws a fixed line of its own at rest (a popover's 1px,
 * a secondary button's edge), whose border reads no border width or
 * border color token. --border-width does not widen any of them. A family
 * member the census does not record is kept.
 * @param {any} C the part census
 * @returns {string[]}
 */
export function borderlessSurfaces(C) {
  const rest = (/** @type {{when: string[]}} */ r) =>
    r.when.some(w => !/:|selected/.test(w));
  /** Whether the layer runtime places the part (its sizes read the layer's inset). @param {string} pt */
  const layered = pt =>
    Object.values(C.MAP[pt]?.own ?? {}).some((/** @type {any} */ x) =>
      (x?.values ?? []).some((/** @type {unknown} */ v) =>
        /--astryx-layer-/.test(String(v)),
      ),
    );
  /** A box with container or element corners and a fill around other parts (a banner, a segmented control). @param {string} pt */
  const framed = pt =>
    (C.partReads(pt, 'corners') ?? []).some(
      (/** @type {any} */ r) =>
        /^--radius-(?:container|element)$/.test(r.token) && rest(r),
    ) &&
    (C.partReads(pt, 'background') ?? []).some(rest) &&
    (C.MAP[pt]?.contains ?? []).length > 0;
  /** The values a part sets at rest. @param {string} pt @param {string} k */
  const atRest = (pt, k) =>
    Object.entries(C.MAP[pt]?.at?.[k] ?? {})
      .filter(([sel]) => !/:/.test(sel))
      .map(([, v]) => String(v));
  // A part that draws its box only when selected takes its border there.
  const selectedOnly = new Set(selectedBoxes(C));
  /** An inline box with a fill and room inside it around its label (a badge, a token). @param {string} pt */
  const labelBox = pt =>
    !selectedOnly.has(pt) &&
    atRest(pt, 'display').some(v => /^inline-(?:flex|block)$/.test(v.trim())) &&
    [...atRest(pt, 'padding-inline'), ...atRest(pt, 'padding')].some(
      v => !/^\s*0(?:px)?\s*$/.test(v),
    ) &&
    (C.partReads(pt, 'background') ?? []).some(rest);
  /** A line of a fixed width at rest (not a token, not 0). @param {string} pt */
  const fixedLine = pt =>
    Object.entries(C.MAP[pt]?.at ?? {}).some(
      ([k, v]) =>
        /^border(-[a-z-]+)?-width$/.test(k) &&
        Object.entries(/** @type {Record<string, unknown>} */ (v)).some(
          ([sel, w]) =>
            !/:/.test(sel) &&
            !/^\s*0(?:px)?\s*$/.test(String(w)) &&
            !/var\(/.test(String(w)),
        ),
    );
  const candidates = new Set([
    ...(FAMILIES.containers ?? []),
    ...(FAMILIES.menus ?? []),
    ...Object.keys(C.MAP).filter(
      pt =>
        layered(pt) ||
        framed(pt) ||
        labelBox(pt) ||
        fixedLine(pt) ||
        (C.partReads(pt, 'shadow') ?? []).some(
          (/** @type {any} */ r) => /^--shadow-/.test(r.token) && rest(r),
        ),
    ),
  ]);
  // (A line on some sides only, a grouped button's join with the one before
  // it, is no box of the part's own.)
  return [...candidates].filter(
    pt =>
      !(C.partReads(pt, 'border') ?? []).some(
        (/** @type {{token: string, props?: string[]}} */ r) =>
          (r.token === '--border-width' || /^--color-border/.test(r.token)) &&
          (r.props ?? ['border']).some(
            p =>
              !/^border-(top|bottom|left|right|(inline|block)(-(start|end))?)-/.test(
                p,
              ),
          ),
      ),
  );
}

/**
 * The parts that draw a divider with the shared border width: one side's
 * border (a table cell's bottom rule) or an inner line (a divider's), not
 * a box around the part nor an edge of a cornered box (a list row's). A wider --border-width makes their rules heavy.
 * @param {any} C the part census
 * @returns {string[]}
 */
export function dividerParts(C) {
  return Object.keys(C.MAP).filter(pt => {
    const at = C.MAP[pt]?.at ?? {};
    /** @param {string} k */
    const reads = k =>
      Object.values(at[k] ?? {}).some(v => /--border-width/.test(String(v)));
    if (reads('border-width')) return false;
    const sides = Object.keys(at).filter(
      k => /^border-[a-z-]+-width$/.test(k) && reads(k),
    );
    const inner = (C.MAP[pt]?.inside?.['--border-width'] ?? []).some(
      (/** @type {string} */ p) =>
        /^(height|width|block-size|inline-size)$/.test(p),
    );
    // A rule, not a box: a part with corners of its own (a list row, a
    // button) draws an edge of the box it is.
    const cornered = (C.partReads(pt, 'corners') ?? []).some(
      (/** @type {{token: string}} */ r) => /^--radius-/.test(r.token),
    );
    return !cornered && (sides.length === 1 || (!sides.length && inner));
  });
}

/**
 * Refuses a property the part data records from a line inside the part
 * with no target of its own (a divider's line): written on the part's own
 * element, it paints under the line and never shows. The lines offered set
 * the token the line reads for it, per variant.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').Setting} s
 * @param {string} prop
 * @param {string} v
 */
function lineRefusal(ctx, slug, s, prop, v) {
  const parts = partsOf(ctx, s);
  // A border's color or width on a part whose line an element inside it
  // draws, and whose own element draws no border (a divider): there is no
  // border for it to color or widen. The line's own token is what reaches
  // it: its color, or the border width its thickness reads.
  if (
    /^border(?:-(?:top|right|bottom|left|block|inline)(?:-(?:start|end))?)?-(color|width)$/.test(
      prop,
    ) &&
    parts.length &&
    parts.every(
      t =>
        (ctx.C.MAP[t]?.line ?? []).length &&
        !Object.keys(ctx.C.MAP[t]?.own ?? {}).some(
          k =>
            /^border(?:-[a-z-]+)?(?:-style)?$/.test(k) &&
            !/radius|color|width/.test(k),
        ),
    )
  ) {
    const part = parts[0];
    const lineProps = ctx.C.MAP[part]?.line ?? [];
    const width = prop.endsWith('-width');
    const toks = [
      ...new Set(
        lineProps.flatMap((/** @type {string} */ lp) =>
          Object.keys(ctx.C.MAP[part]?.own?.[lp]?.tokens ?? {}),
        ),
      ),
    ].filter(t => (width ? /^--border-width\b/.test(t) : /^--color-/.test(t)));
    refuse(
      E.ERR_THEME_NO_EFFECT,
      `${part} draws no border: its line is drawn by an element inside it, so ${prop} on ${part} has no border to ${width ? 'widen' : 'color'}${toks.length ? `; the line reads ${toks.join(' and ')} for its ${width ? 'thickness' : 'color'}` : ''}.`,
      {
        run: toks.length
          ? toks.map(
              tok =>
                `${P} set ${slug} ${tok} ${quoteCommandArgument(v)} --on ${s.on ?? part}${s.when ? ` --when ${s.when}` : ''}${s.mode && !width ? ` --mode ${s.mode}` : ''}`,
            )
          : [`${HOW} ${part}`],
      },
    );
  }
  const drawn = (/** @type {string} */ t) =>
    (ctx.C.MAP[t]?.line ?? []).includes(prop) ||
    (prop === 'background' &&
      (ctx.C.MAP[t]?.line ?? []).includes('background-color'));
  if (!parts.length || !parts.every(drawn)) return;
  const part = parts[0];
  const key = prop === 'background' ? 'background-color' : prop;
  const asked = /^variant:([\w-]+)$/.exec(String(s.when ?? ''))?.[1];
  /** @type {Map<string, string[]>} token -> variants */
  const byToken = new Map();
  for (const [token, conds] of Object.entries(
    ctx.C.MAP[part]?.own?.[key]?.tokens ?? {},
  ))
    for (const cond of /** @type {string[]} */ (conds)) {
      const variant = /\bvariant=([\w-]+)/.exec(cond)?.[1] ?? '';
      if (asked && variant && variant !== asked) continue;
      byToken.set(token, [...(byToken.get(token) ?? []), variant]);
    }
  const isColor = /color|^background/.test(key);
  refuse(
    E.ERR_THEME_NO_EFFECT,
    `${part}'s line is drawn by an element inside it, so ${prop} on ${part} paints under the line and never shows${byToken.size ? `; the line reads ${[...byToken.keys()].join(' and ')} for it` : ''}.`,
    {
      run: isColor
        ? [...byToken.keys()].map(
            tok =>
              `${P} set ${slug} ${tok} ${quoteCommandArgument(v)} --on ${s.on ?? part}${asked ? ` --when ${s.when}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}`,
          )
        : [`${HOW} ${part}`],
    },
  );
}

/**
 * Refuses an outline's color, width or offset on a part whose outline Core
 * draws as none in every rule (an input, which shows focus with a ring in
 * its box-shadow), when the theme sets no outline style for it either.
 * The line offered draws the ring the part does show, in the state asked.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {any} data
 * @param {import('./_settings.mjs').Setting} s
 * @param {string} prop
 * @param {string} v
 */
function noOutlineRefusal(ctx, slug, data, s, prop, v) {
  const parts = partsOf(ctx, s);
  /** @param {string} t */
  const drawsNone = t => {
    const at = ctx.C.MAP[t]?.at ?? {};
    const styles = [
      ...Object.values(at.outline ?? {}),
      ...Object.values(at['outline-style'] ?? {}),
    ].map(String);
    // (A part Core sets no outline on draws none too, except where it is
    // the focused element itself, which the browser may outline.)
    return styles.length
      ? styles.every(x => /^\s*none\b/.test(x) || /^\s*0(px)?\s*$/.test(x))
      : !/^focus(-visible)?$/.test(String(s.state ?? ''));
  };
  const styled = (/** @type {string} */ t) =>
    (data?.settings ?? []).some(
      (/** @type {any} */ y) =>
        /^outline(-style)?$/.test(String(y.thing)) &&
        !/^\s*none\b/.test(String(y.value)) &&
        partsOf(ctx, y).includes(t),
    );
  if (!parts.length || !parts.every(t => drawsNone(t) && !styled(t))) return;
  const part = parts[0];
  const state = s.state ?? 'focus-within';
  const ring = Object.entries(ctx.C.MAP[part]?.at?.['box-shadow'] ?? {}).some(
    ([k, x]) =>
      new RegExp(`:${state}(?![\\w-])`).test(k) &&
      !/^\s*none\s*$/.test(String(x)),
  );
  refuse(
    E.ERR_THEME_NO_EFFECT,
    `${s.on ?? part} draws no outline (Core sets its outline to none${ring ? `; it shows ${state === 'hover' ? 'hover' : 'focus'} with a ring in its box-shadow` : ''}), so ${prop} never shows there.`,
    {
      run:
        ring && prop === 'outline-color'
          ? [
              `${P} set ${slug} box-shadow ${quoteCommandArgument(`inset 0 0 0 2px ${v}`)} --on ${s.on ?? part} --state ${state}${s.mode ? ` --mode ${s.mode}` : ''}`,
            ]
          : [`${HOW} ${s.on ?? part}`],
    },
  );
}

/**
 * Refuses a text color token for a part whose text sits on Core's media
 * surface inside it (a toast's inverted surface): that surface sets the
 * text tokens of what it holds from --color-on-dark where it is dark and
 * --color-on-light where it is light, so a text token on the part never
 * shows. Its `color` reaches the text (it goes into those two on the part),
 * and so do those two.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').Setting} s
 * @param {string} v
 */
function mediaTextRefusal(ctx, slug, s, v) {
  // (A `color` on the part is its text color: written into the two colors
  // the surface gives its text, on the part alone.)
  if (s.source === 'property' && s.thing === 'color') return;
  const parts = partsOf(ctx, s);
  const held = parts.filter(
    t => ctx.C.MAP[t]?.media && !ctx.C.MAP[t]?.own?.color,
  );
  if (!parts.length || held.length !== parts.length) return;
  const part = held[0];
  // A surface that keeps one side (a lightbox's dark island) draws its
  // text in the on-color for that side: that token on the part reaches it
  // there and nowhere else. One that follows its fill (a toast's) takes a
  // color on the part, written into both on-colors.
  const sides = /** @type {string[]} */ (
    /** @type {any} */ (ctx.C.MAP[part])?.mediaSides ?? []
  );
  const fixed = !autoMediaPart(ctx, part) && sides.length === 1;
  refuse(
    E.ERR_THEME_NO_EFFECT,
    `${part}'s text sits on Core's media surface inside it, which sets the text color from --color-on-dark where that surface is dark and --color-on-light where it is light, so a text color token on ${part} never reaches it; ${fixed ? `set --color-on-${sides[0]} on ${part} instead (its surface is always ${sides[0]})` : `set its color on ${part} instead`}.`,
    {
      // (The flags the command was given carry over: a variant; a mode
      // too, except on a surface that draws one side in both modes.)
      run: [
        `${P} set ${slug} ${fixed ? `--color-on-${sides[0]}` : 'color'} ${quoteCommandArgument(v)} --on ${s.on ?? part}${s.when ? ` --when ${s.when}` : ''}${s.mode && !fixed ? ` --mode ${s.mode}` : ''}${s.only ? ' --only' : ''}`,
      ],
    },
  );
}

/**
 * What a text property CSS inherits, set on a part, also reaches: the parts
 * inside it that set no such property of their own, said in one line; null
 * for any other property or when none does.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {{on?: string, only?: boolean, thing?: string}} s
 * @param {string} prop kebab-case
 * @returns {string | null}
 */
export function inheritedReach(ctx, s, prop) {
  if (!INHERITED_TEXT.test(prop)) return null;
  const reached = [
    ...new Set(
      partsOf(ctx, /** @type {any} */ (s)).flatMap(t =>
        /** @type {string[]} */ (ctx.C.MAP[t]?.contains ?? []).filter(
          inner =>
            ctx.project.target.has(inner) && !ctx.C.MAP[inner]?.own?.[prop],
        ),
      ),
    ),
  ];
  return reached.length
    ? `${prop} is inherited, so it also reaches ${reached.slice(0, 4).join(', ')}${reached.length > 4 ? ' and more' : ''} inside ${s.on}, which set no ${prop} of their own`
    : null;
}

/**
 * How a typed --when reads against the props and values a part (or the
 * members of a group, between them) has: `written`, the same prop and
 * value in other letters or with spaces or `=` between (`Variant:
 * Primary`); `meant`, a prop or value one typo from the one there (the one
 * typo limit, one reading only). Each is null when it does not apply.
 * @param {string} when
 * @param {string[]} props
 * @param {Record<string, string[]>} variants each prop's values
 * @returns {{written: string | null, meant: string | null}}
 */
function whenReading(when, props, variants) {
  const conditions = Object.keys(variants);
  const m = /^\s*([^:=\s]+)\s*[:=]\s*([^:=]+?)\s*$/.exec(when);
  let written = null;
  if (m) {
    const prop = props.find(x => x.toLowerCase() === m[1].toLowerCase());
    const vals = prop ? (variants[prop] ?? []) : [];
    const val = vals.length
      ? vals.find(x => x.toLowerCase() === m[2].toLowerCase())
      : m[2];
    const read = prop && val ? `${prop}:${val}` : null;
    if (read && read !== when) written = read;
  }
  const [p, wv, ...more] = when.split(':');
  if (!wv || more.length) return {written, meant: null};
  /** @param {string} w @param {string[]} list */
  const typoIn = (w, list) => {
    const hits = list.filter(x => typoOf(w, x));
    return hits.length === 1 ? hits[0] : null;
  };
  const propMeant = [...props, ...conditions].includes(p)
    ? p
    : typoIn(p, [...new Set([...props, ...conditions])]);
  const valsMeant = propMeant ? (variants[propMeant] ?? []) : [];
  const valMeant =
    !valsMeant.length || valsMeant.includes(wv) ? wv : typoIn(wv, valsMeant);
  return {
    written,
    meant: propMeant && valMeant ? `${propMeant}:${valMeant}` : null,
  };
}

/**
 * Whether every `+` piece of a state is one of the states.
 * @param {string[]} states
 * @param {string} state
 * @returns {boolean}
 */
function statesHold(states, state) {
  return String(state)
    .split('+')
    .every(p => states.includes(p));
}

/**
 * Whether Core paints a part in every one of several states at once (a
 * checked and disabled box): a condition the part data holds for it names
 * each.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} part
 * @param {string[]} pieces
 * @returns {boolean}
 */
function paintedTogether(ctx, part, pieces) {
  const kebab = (/** @type {string} */ x) =>
    x.replace(/[A-Z]/g, c => `-${c.toLowerCase()}`);
  const named = (/** @type {string} */ cond, /** @type {string} */ p) => {
    const aria = ARIA_STATES[/** @type {keyof typeof ARIA_STATES} */ (p)];
    if (aria) return cond.includes(`${aria.attr}=`);
    // (A doc state Core marks with its ARIA attribute, a toggle button's
    // isPressed by aria-pressed.)
    const asAria = /^is([A-Z][a-z]+)$/.exec(p)?.[1]?.toLowerCase();
    if (asAria && cond.includes(`aria-${asAria}=`)) return true;
    return (
      new RegExp(`(^|[\\s,])${kebab(p)}=`).test(cond) ||
      new RegExp(`:${p}(?![\\w-])`).test(cond) ||
      (p === 'disabled' && /disabled/.test(cond))
    );
  };
  const conds = Object.values(ctx.C.MAP[part]?.at ?? {}).flatMap(byCond =>
    Object.keys(/** @type {object} */ (byCond)),
  );
  // An interaction the element takes (a hover, a focus) goes with any
  // state it is drawn in: each needs only a condition of its own (a tab
  // hovered, a tab selected). States marked by attributes (selected,
  // pressed, current) must be named together by one condition: a
  // pagination's current page is never pressed.
  const interaction = (/** @type {string} */ p) =>
    COMMON_STATES.includes(p) && p !== 'disabled';
  const marked = pieces.filter(p => !interaction(p));
  const markedOk =
    marked.length <= 1
      ? marked.every(p => conds.some(cond => named(cond, p)))
      : conds.some(cond => marked.every(p => named(cond, p)));
  // (An element people press or focus, a tab's button, takes every
  // interaction; a box drawn beside its input, a checkbox's indicator,
  // takes none its part data does not show.)
  const interactive =
    (ctx.C.MAP[part]?.tags ?? []).some((/** @type {string} */ t) =>
      /^(button|a|input|select|textarea|summary)$/.test(t),
    ) || conds.some(cond => /:(hover|active|focus|focus-visible)\b/.test(cond));
  return (
    markedOk &&
    pieces
      .filter(interaction)
      .every(p => interactive || conds.some(cond => named(cond, p)))
  );
}

/**
 * A state typed in another case or with dashes (`is-pressed` for
 * isPressed): the state of that name, or null.
 * @param {string} state
 * @param {string[]} states
 */
function sameState(state, states) {
  const flat = (/** @type {string} */ x) =>
    x.replace(/[-_\s]/g, '').toLowerCase();
  return states.find(x => flat(x) === flat(state)) ?? null;
}

/** Other words for a state, each read as the first of these there is. */
const STATE_SYNONYMS = wordTable(
  /** @type {Record<string, string[]>} */ ({
    pressed: ['isPressed', 'active'],
    press: ['isPressed', 'active'],
    on: ['isPressed', 'checked', 'selected'],
    down: ['active'],
    clicked: ['active'],
    hovered: ['hover'],
    focused: ['focus-visible', 'focus-within', 'focus'],
    checked: ['checked', 'selected'],
    selected: ['selected', 'checked'],
    open: ['open', 'expanded'],
    expanded: ['expanded', 'open'],
    inactive: ['disabled'],
  }),
);

/**
 * The state a word for one names among those a part has, by the one table
 * of other words for states (expanded: open; pressed: a toggle's isPressed,
 * else active); null when none of them is the part's.
 * @param {string} word
 * @param {string[]} states
 * @returns {string | null}
 */
export function stateSynonym(word, states) {
  return (
    (STATE_SYNONYMS[word.toLowerCase()] ?? []).find(x => states.includes(x)) ??
    null
  );
}

/**
 * The part's state a negated state word denies (`unpressed`, `not-pressed`,
 * `non-selected`), or null: the word names the part when it is NOT in that
 * state, its rest look, which a setting with no --state gives. Never a
 * reading as the state itself (the opposite of what was asked). A word the
 * synonym table reads (inactive) keeps that reading.
 * @param {string} state
 * @param {string[]} states
 * @returns {string | null}
 */
function negatedState(state, states) {
  const w = state.toLowerCase();
  if (STATE_SYNONYMS[w]) return null;
  const m = /^(?:un|non-?|not-?)([a-z][a-z-]*)$/.exec(w);
  if (!m) return null;
  const denied = m[1];
  return (
    sameState(denied, states) ??
    (STATE_SYNONYMS[denied] ?? []).find(x => states.includes(x)) ??
    null
  );
}

/**
 * The state a typed one means among those a part (or a group's members)
 * has: another word for one, else the nearest; null when none is near.
 * @param {string} state
 * @param {string[]} states
 * @returns {string | null}
 */
function stateMeant(state, states) {
  return (
    (STATE_SYNONYMS[state.toLowerCase()] ?? []).find(x => states.includes(x)) ??
    nearest(state, states)[0] ??
    null
  );
}

/**
 * The states `set` takes on a part: the ones its doc lists and the ones
 * every part takes, less any a change in it is refused for while the same
 * change without it passes (a state that never applies there). `how` lists
 * these, and a state that is not one names them.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {any} data
 * @param {string} part
 * @returns {string[]}
 */
export function settableStates(ctx, slug, data, part) {
  const t = ctx.project.target.get(part);
  if (!t) return [];
  const takes = (/** @type {string | undefined} */ state) => {
    try {
      checkSetting(ctx, slug, data, 'opacity', '1', {
        on: part,
        ...(state ? {state} : {}),
      });
      return true;
    } catch {
      return false;
    }
  };
  const plain = takes(undefined);
  return partStates(ctx, part).filter(state => !plain || takes(state));
}

/**
 * The paints of a property Core gives a part in its variants and states at
 * rest (a primary button's accent fill, a checked box's), which a setting
 * of that property on the plain part covers in every one of them (the
 * theme's rules sit over Core's). Each with the condition as set names it
 * (`--when variant:primary`, `--state checked`) when it can, else as Core's
 * condition (`checked=checked`, `aria-current=page`); and the token the
 * plain part reads at rest, if any.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} part
 * @param {string} prop a background or color property
 * @returns {{rest: string | null, covered: Array<{token: string, flags: string | null, cond: string}>}}
 */
export function coveredPaints(ctx, part, prop) {
  const C = ctx.C;
  const group = C.groupOfProp(prop);
  const props = /^background/.test(prop)
    ? ['background-color', 'background']
    : [prop];
  const t = ctx.project.target.get(part);
  const reads = (group ? C.partReads(part, group) : []).filter(
    r => r.props.some(x => props.includes(x)) && !/overlay|tint/.test(r.token),
  );
  const rest = reads.find(r => r.when.includes(''))?.token ?? null;
  /** @type {Array<{token: string, flags: string | null, cond: string}>} */
  const covered = [];
  for (const r of reads)
    for (const w of r.when) {
      // Only the conditions of the part at rest: a pseudo-class (hover) is
      // a state set names itself.
      const cond = w
        .replace(/^--when /, '')
        .replace(/\s*\(not settable:.*$/, '')
        .trim();
      if (!cond || /(^|\s):|--state/.test(cond)) continue;
      // One condition set can name: a state of the part's own (written as
      // its name) with --state, a visual prop of its with --when.
      const one = /^([\w-]+)[=:]([\w-]+)$/.exec(cond);
      const [k, v] = one ? [one[1], one[2]] : ['', ''];
      const flags = !one
        ? null
        : t?.states.includes(k) && (v === k || v === 'true')
          ? `--state ${k}`
          : // (A prop the part's doc lists, or one the census saw it drawn
            // with, a toast's `type`.)
            t?.props.includes(k) ||
              /** @type {any} */ (C.MAP[part])?.attrs?.[k]?.includes(v)
            ? `--when ${k}:${v}`
            : null;
      covered.push({token: r.token, flags, cond: cond.replace(':', '=')});
    }
  return {rest, covered};
}

/**
 * Check one setting and give it back ready to store, or refuse. What it
 * accepts, the settings loader takes too: the loader's own check runs last,
 * so a saved setting never blocks the theme.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} thing
 * @param {string | undefined} value
 * @param {SetFlags} flags
 * @param {boolean} [unset] an undo of one setting: only the identity of the setting is checked
 * @param {{reads?: ReadonlySet<string>, element?: Record<string, unknown>}} [scope] `reads`: the custom
 *   properties the theme itself sets where the value is read, which a var()
 *   in it reads as it reads a design token; `element`: the custom properties
 *   set on the element the value is set on, when that is not the theme's
 *   root (a surface's own tokens), the only ones that can loop back to it
 * @returns {import('./_settings.mjs').Setting}
 */
export function checkSetting(
  ctx,
  slug,
  data,
  thing,
  value,
  flags,
  unset = false,
  scope = {},
) {
  try {
    return checkTyped(ctx, slug, data, thing, value, flags, unset, scope);
  } catch (e) {
    throw keepTypedScope(e, ctx, slug, data, flags);
  }
}

/** The scope flags a refusal's line keeps from the line typed. */
const SCOPE_FLAGS = /** @type {const} */ (['state', 'when', 'mode']);

/**
 * Every line a refusal offers for the theme keeps the scope typed: a
 * `--state` or `--when` on the same part, and a `--mode`, that the line
 * leaves out and does not give another value for go back into it whenever
 * the command takes the line with them, so following the line never writes
 * wider than what was asked (a hovered link's color offered for every
 * link). A line the command refuses with that flag (a `--mode` on what is
 * not a color) is the one that works, and is kept as it is.
 * @param {unknown} e
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {SetFlags} flags
 */
function keepTypedScope(e, ctx, slug, data, flags) {
  if (!(e instanceof AstryxError) || !e.suggestions?.length || !data) return e;
  const typed = SCOPE_FLAGS.filter(k => flags?.[k]);
  if (!typed.length) return e;
  /** The line as the command reads it, set or undo. @param {string} name */
  const read = name => {
    const sub = name.startsWith(`${P} undo ${slug} `)
      ? 'undo'
      : name.startsWith(`${P} set ${slug} `)
        ? 'set'
        : null;
    if (!sub) return null;
    const line = readSetLine(
      sub === 'undo' ? name.replace(`${P} undo `, `${P} set `) : name,
      slug,
    );
    return line ? {sub, ...line} : null;
  };
  /**
   * Whether the command takes the line with these flags.
   * @param {NonNullable<ReturnType<typeof read>>} line
   * @param {SetFlags} withFlags
   */
  const takes = (line, withFlags) => {
    try {
      checkTyped(
        ctx,
        slug,
        structuredClone(data),
        line.thing,
        line.value,
        withFlags,
        line.sub === 'undo',
      );
      return true;
    } catch (err) {
      if (err instanceof AstryxError) return false;
      throw err;
    }
  };
  e.suggestions = e.suggestions.map(x => {
    const line = read(x.name);
    if (!line) return x;
    const missing = typed.filter(
      k =>
        line.flags[k] == null &&
        (k === 'mode' || (line.flags.on ?? null) === (flags.on ?? null)),
    );
    if (!missing.length) return x;
    /** @type {SetFlags} */
    const withFlags = {...line.flags};
    for (const k of missing) /** @type {any} */ (withFlags)[k] = flags[k];
    // Each flag on its own when the line does not take them together.
    const kept = takes(line, withFlags)
      ? withFlags
      : missing
          .map(k => ({...line.flags, [k]: flags[k]}))
          .find(f => takes(line, f));
    if (!kept) return x;
    const name = setLine(
      slug,
      line.thing,
      line.value,
      kept,
      line.sub === 'undo',
    );
    return {...x, name};
  });
  return e;
}

/**
 * {@link checkSetting} without the scope pass on its refusals.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} thing
 * @param {string | undefined} value
 * @param {SetFlags} flags
 * @param {boolean} [unset]
 * @param {{reads?: ReadonlySet<string>, element?: Record<string, unknown>}} [scope]
 * @returns {import('./_settings.mjs').Setting}
 */
function checkTyped(
  ctx,
  slug,
  data,
  thing,
  value,
  flags,
  unset = false,
  {reads, element} = {},
) {
  // Any other dial's value pasted with its property name (`font-size:
  // 18px;` for text-size, `color: #e11d48` for accent) is the value: one
  // path for every dial (the font dial reads its own below).
  // A light and a dark color typed as one value: a token takes both as
  // light-dark() or one --mode at a time; a color dial takes one color and
  // makes both modes from it. Never one of them for both.
  // A light-dark() written with another separator (`light-dark(red /
  // blue)`, `light-dark(red; blue)`): the pair meant, with a comma.
  // A dial's own words in any case (ROOMY, MORE, Both, NONE): the word.
  if (!unset && typeof value === 'string')
    value = dialWordOf(thing, value) ?? value;
  if (!unset && typeof value === 'string') {
    const near =
      /^\s*light-dark\(\s*([^,;/()]+?)\s*(?:\s\/\s|\/|;)\s*([^,;/()]+?)\s*\)\s*$/i.exec(
        value,
      );
    if (near)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${value}" separates its two colors with something other than a comma; light-dark() takes "light-dark(light, dark)".`,
        {
          run: [
            setLine(
              slug,
              thing,
              `light-dark(${near[1]}, ${near[2]})`,
              {...flags, mode: undefined},
              false,
            ),
          ],
        },
      );
  }
  // Tailwind's color/opacity shorthand (`black/5`, `#000/10`) is no CSS
  // color: the same color at that opacity is, and is the line offered; a
  // Tailwind stop (`blue-500/20`) is named, since its color is not read
  // here. The opacity is never dropped.
  if (!unset && typeof value === 'string') {
    const read = colorOpacitiesAsCss(value);
    if (read) {
      const {css: asCss, found: clear, unread} = read;
      refuse(
        E.ERR_THEME_BAD_VALUE,
        unread.length
          ? `${unread.map(x => `"${x.typed}"`).join(', ')} ${unread.length > 1 ? 'are colors' : 'is a color'} with an opacity after the slash, as Tailwind writes it; CSS writes a color at an opacity as rgb(r g b / alpha), such as rgb(59 130 246 / 0.2). Give the color written out at that opacity.`
          : `${clear.map(x => `"${x.typed}"`).join(', ')} ${clear.length > 1 ? 'are colors' : 'is a color'} with an opacity after the slash, as Tailwind writes it; CSS writes ${clear.length > 1 ? 'them' : 'it'} as ${clear.map(x => x.color).join(', ')}.`,
        {
          run: unread.length
            ? [`${HOW} ${thing}`]
            : [setLine(slug, thing, asCss, flags)],
        },
      );
    }
  }
  // A value that holds NaN or undefined (a script's empty value pasted)
  // is no CSS value, and Core refuses a theme that resolves to one.
  if (
    !unset &&
    typeof value === 'string' &&
    /\b(?:NaN|undefined)\b/.test(value)
  )
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${value.trim()}" holds ${/\bNaN\b/.test(value) ? 'NaN' : 'undefined'}, which is no CSS value: Core refuses a theme that resolves to it.`,
      {run: [`${HOW} ${thing}`]},
    );
  // One reader for a family list, on the font dial, a family token and a
  // part's font-family: a weight or a size in it, alone or after a
  // family, is no family, and a quoted generic is a family named that.
  const fontish =
    thing === 'font' ||
    thing === 'font-family' ||
    thing.startsWith('--font-family');
  const listProblem =
    !unset && typeof value === 'string' && fontish
      ? fontListProblem(value, ctx, thing === 'font')
      : null;
  if (listProblem) {
    const on = flags.on ? ` --on ${flags.on}` : '';
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${String(value).trim()}" ${listProblem.why}. ${thing} takes the families${listProblem.families ? ` (${listProblem.families})` : ''}${listProblem.size ? '; a size is set with text-size or a --font-size-* token' : listProblem.rung ? '; a weight is set with headings, font-weight or a --font-weight-* token' : listProblem.style ? '; a style is set with font-style on a part' : ''}.`,
      {
        run: [
          ...(listProblem.families
            ? [
                `${P} set ${slug} ${thing} ${quoteCommandArgument(listProblem.families)}${on}`,
              ]
            : []),
          // The family as typed, kept as written by its quotes.
          ...(listProblem.asTyped
            ? [
                `${P} set ${slug} ${thing} ${quoteCommandArgument(listProblem.asTyped)}${on}`,
              ]
            : []),
          ...(thing === 'font' && listProblem.rung
            ? [`${P} set ${slug} headings ${listProblem.rung}`]
            : []),
          ...(thing === 'font' && listProblem.textSize != null
            ? [`${P} set ${slug} text-size ${listProblem.textSize}`]
            : []),
          ...(thing === 'font-family' && flags.on && listProblem.style
            ? [`${P} set ${slug} font-style ${listProblem.style}${on}`]
            : []),
          ...(listProblem.families
            ? []
            : [`${HOW} ${quoteCommandArgument(thing)}`]),
        ],
      },
    );
  }
  // A font list with a comma missing before its generic family, or a
  // generic written with a space, on the font dial or a part's
  // font-family: the list meant (a family token reads it with its type).
  if (
    !unset &&
    typeof value === 'string' &&
    (thing === 'font' || thing === 'font-family')
  ) {
    const fixed = fontListMeant(value);
    if (fixed)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${value}" names a family that exists nowhere: ${fixed.why}.`,
        {run: [setLine(slug, thing, fixed.value, flags, false)]},
      );
    // A font dial word that names no family (mono, system, rounded): a
    // part's font-family takes the stack it stands for, never the word.
    const word = value.trim().toLowerCase();
    const stack = thing === 'font-family' ? fontStack(word) : null;
    if (
      stack &&
      FONTS[word] &&
      FONTS[word][0].toLowerCase() !== word &&
      !isSystemFamily(word)
    )
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${value.trim()}" is a font dial word, not a family: no font is named that. font-family takes the families it stands for (${stack}).`,
        {run: [setLine(slug, thing, stack, flags, false)]},
      );
  }
  // A light and a dark color on a part's color property (`background`,
  // `color`, `border-color` …) is that property's light-dark() pair.
  if (
    !unset &&
    typeof value === 'string' &&
    flags.on &&
    !flags.mode &&
    /^(color|background|(background|border|outline|text-decoration|caret|accent|fill|stroke)(-[a-z]+)?-color)$/.test(
      String(thing).trim().toLowerCase(),
    )
  ) {
    const pair = colorPair(value);
    if (pair && !colorProblem(pair.light) && !colorProblem(pair.dark)) {
      // A theme with one mode shows one half: that half is the line, as
      // for a color token.
      const only = oneModeOfTheme(data);
      if (only)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${value}" is a light and a dark color; this theme is ${only} only, so it shows the ${only} one.`,
          {
            run: [
              setLine(slug, thing, pair[only], {...flags, mode: undefined}),
            ],
          },
        );
      value = `light-dark(${pair.light}, ${pair.dark})`;
    }
  }
  if (
    !unset &&
    typeof value === 'string' &&
    (PALETTE_DIALS.includes(thing) || isColorToken(thing))
  ) {
    const pair = colorPair(value);
    if (pair && !colorProblem(pair.light) && !colorProblem(pair.dark)) {
      const q = quoteCommandArgument;
      const on = flags.on ? ` --on ${flags.on}` : '';
      // A theme with one mode shows one half: that half is the line.
      const only = oneModeOfTheme(data);
      if (only)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${value}" is a light and a dark color; this theme is ${only} only, so it shows the ${only} one.`,
          {run: [`${P} set ${slug} ${thing} ${q(pair[only])}${on}`]},
        );
      refuse(
        E.ERR_THEME_BAD_VALUE,
        PALETTE_DIALS.includes(thing)
          ? `"${value}" is a light and a dark color; ${thing} takes one color and makes both modes from it.`
          : `"${value}" is a light and a dark color; ${thing} takes them as light-dark(), or one --mode at a time.`,
        {
          run: PALETTE_DIALS.includes(thing)
            ? [
                `${P} set ${slug} ${thing} ${q(pair.light)}${on}`,
                ...(thing === 'accent'
                  ? [
                      `${P} set ${slug} --color-accent ${q(`light-dark(${pair.light}, ${pair.dark})`)}${on}`,
                    ]
                  : []),
              ]
            : [
                `${P} set ${slug} ${thing} ${q(`light-dark(${pair.light}, ${pair.dark})`)}${on}`,
                `${P} set ${slug} ${thing} ${q(pair.light)}${on} --mode light`,
                `${P} set ${slug} ${thing} ${q(pair.dark)}${on} --mode dark`,
              ],
        },
      );
    }
  }
  // A part typed in the setting's place, the setting and its value after it
  // (`set t button background-color '#2563eb'`, `card padding 20px`,
  // `card 'padding: 20px'`, `buttons background-color red`): the setting
  // on that part, as --on reads it. (A dial of the same name, `buttons`,
  // only when what follows is no value of it.)
  if (!unset && typeof value === 'string' && !flags.on) {
    const on = partNamed(ctx, thing);
    const m =
      /^\s*([a-z-]+|--[a-z0-9-]+)\s*(?::\s*|\s+)(\S[\s\S]*?)\s*;?\s*$/i.exec(
        value,
      );
    const next = m ? m[1].toLowerCase() : '';
    if (
      on &&
      m &&
      (!DIALS[thing] || !dialValueFits(thing, value)) &&
      (DIALS[next] || cssProperties().has(next) || next.startsWith('--'))
    )
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${thing}" is a part, typed in the setting's place; the setting is ${next}, and a value for one part is given with --on ${on}.`,
        {
          run: [
            `${P} set ${slug} ${next} ${quoteCommandArgument(m[2])} --on ${on}${flags.when ? ` --when ${flags.when}` : ''}${flags.state ? ` --state ${flags.state}` : ''}${flags.mode ? ` --mode ${flags.mode}` : ''}`,
          ],
        },
      );
  }
  // A dial's value that names a part or group, plural included, as a label
  // (`spacing 'buttons: roomy'`, `corners 'cards: pill'`), after `on`
  // (`'pill on card'`) or as its first or last word (`'card pill'`): the
  // part is read first, by the one part-in-value reader the properties
  // use, so the line keeps the change on that part, never the whole theme
  // (and never a dial the label also spells, when the rest is this dial's
  // value). The font takes any words, so its value is never split.
  if (
    !unset &&
    typeof value === 'string' &&
    DIALS[thing] &&
    thing !== 'font' &&
    !flags.on &&
    !dialValueFits(thing, value)
  ) {
    const named = partInValue(ctx, value);
    if (named && dialValueFits(thing, named.value))
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${named.on} in "${value}" is a part; a value for one part is given with --on ${named.on}.`,
        {
          run: [
            `${P} set ${slug} ${thing} ${quoteCommandArgument(named.value)} --on ${named.on}${named.state ? ` --state ${named.state}` : ''}${flags.when ? ` --when ${flags.when}` : ''}${flags.mode ? ` --mode ${flags.mode}` : ''}`,
          ],
        },
      );
  }
  // A value labeled with a word that is not this setting's own name (a
  // mode, a state, a device, a part, or a word the editor does not read) is
  // refused with what that word means here, never set with the word dropped.
  // A property set on a part (`padding 'hover: 4px' --on button`) and the
  // type tokens (`--font-weight-bold 'dark: 700'`) are read the same way;
  // a content string is its own text.
  const partProperty =
    Boolean(flags.on) && !DIALS[thing] && !thing.startsWith('--');
  const familyToken = thing.startsWith('--font-family');
  if (
    !unset &&
    typeof value === 'string' &&
    !/content/.test(thing) &&
    (DIALS[thing] || partProperty || thing.startsWith('--'))
  ) {
    const label = valueLabel(value);
    // Another CSS property's name before the value (`padding 'margin:
    // 8px'`, `corners 'margin: 24px'`, `--spacing-2 'border-radius: 8px'`)
    // is that property's value, never this setting's: for every setting, a
    // pasted property is read only when the setting is what it sets.
    if (
      label &&
      label.word !== thing &&
      !labelOwned(ctx, thing, label.word, Boolean(partProperty)) &&
      cssProperties().has(label.word) &&
      label.rest.trim()
    )
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${value}" is labeled ${label.word}, another property than ${thing}; nothing is set from it.`,
        {
          didYouMean: [label.word],
          run: [setLine(slug, label.word, label.rest.trim(), flags, false)],
        },
      );
    // A CSS property's name before the value (`border-radius: pill`,
    // `color: #e11d48`, `font: bold 16px Inter`) is read by the paths
    // below, as a declaration pasted from a stylesheet.
    if (
      label &&
      !ownLabel(thing, label.word) &&
      !cssProperties().has(label.word)
    ) {
      const q = quoteCommandArgument;
      const rest = label.rest;
      const scope = `${flags.on ? ` --on ${flags.on}` : ''}${flags.when ? ` --when ${flags.when}` : ''}`;
      // A variant named after the value: the value with --when.
      if ('when' in label && label.when)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${value}" names a variant after the value; a value for one variant is given with --on <part> --when ${label.when}.`,
          {
            didYouMean: ['--when'],
            run: [
              flags.on
                ? `${P} set ${slug} ${thing} ${q(rest)} --on ${flags.on} --when ${label.when}`
                : `${HOW} ${q(`${label.when.split(':').pop()} ${thing}`)}`,
            ],
          },
        );
      const mode = modeNear(label.word);
      const colorful =
        PALETTE_DIALS.includes(thing) ||
        (thing.startsWith('--') && isColorToken(thing)) ||
        (partProperty &&
          /color|^background$|^fill$|^stroke$|shadow/.test(thing));
      const parts = [
        ...ctx.project.target.keys(),
        ...Object.keys(groupsOf(ctx)),
      ];
      // A theme with one mode: its own mode's label is the value, as the
      // theme has no other; the other mode's label names a mode it lacks.
      const only = oneModeOfTheme(data);
      if (mode && only) {
        if (mode === only)
          return checkSetting(ctx, slug, data, thing, rest, flags, unset);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${label.word}" in "${value}" names the ${mode} mode, which this ${only}-only theme does not show.`,
          {
            run: [
              `${P} set ${slug} mode both`,
              `${P} set ${slug} ${thing} ${q(rest)}${scope}`,
            ],
          },
        );
      }
      if (mode && DIALS[thing] && PALETTE_DIALS.includes(thing))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${label.word}" in "${value}" names the ${mode} mode; ${thing} makes both modes from one color.`,
          {
            run: [
              `${P} set ${slug} ${thing} ${q(rest)}${scope}`,
              ...(thing === 'accent'
                ? [
                    `${P} set ${slug} --color-accent ${q(rest)}${scope} --mode ${mode}`,
                  ]
                : []),
            ],
          },
        );
      const level = /^h([1-6])$/.exec(label.word)?.[1];
      if (level && thing === 'headings') {
        const w = rest.trim().toLowerCase();
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${label.word}" in "${value}" is one heading level; headings sets every level, and one level is set with --on heading --when level:${level}.`,
          {
            run:
              HEADING_WEIGHTS[w] !== undefined
                ? [
                    `${P} set ${slug} font-weight ${HEADING_WEIGHTS[w]} --on heading --when level:${level}`,
                    `${P} set ${slug} headings ${w}`,
                  ]
                : HEADING_TRACKING[w] !== undefined
                  ? [
                      `${P} set ${slug} letter-spacing ${q(HEADING_TRACKING[w])} --on heading --when level:${level}`,
                      `${P} set ${slug} headings ${w}`,
                    ]
                  : [`${HOW} headings`],
          },
        );
      }
      if (mode)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          colorful
            ? `"${label.word}" in "${value}" names the ${mode} mode; a value for one mode is given with --mode ${mode}.`
            : `"${label.word}" in "${value}" names the ${mode} mode, and ${thing} is the same in light and dark.`,
          {
            run: [
              `${P} set ${slug} ${thing} ${q(rest)}${scope}${colorful ? ` --mode ${mode}` : ''}`,
            ],
          },
        );
      if (STATE_WORDS.includes(label.word))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          flags.on
            ? `"${label.word}" in "${value}" is a state; a value for it is given with --state ${label.word}.`
            : `"${label.word}" in "${value}" is a state; a state is set on a part, with --on <part> --state ${label.word}.`,
          {
            run: [
              flags.on
                ? `${P} set ${slug} ${thing} ${q(rest)}${scope} --state ${label.word}`
                : `${HOW} ${q(`${label.word} ${thing}`)}`,
            ],
          },
        );
      if (DEVICE_WORDS.includes(label.word))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${label.word}" in "${value}" names a kind of screen; the editor sets ${thing} for every screen, not for one kind.`,
          {run: [`${P} set ${slug} ${thing} ${q(rest)}${scope}`]},
        );
      // `on button: pill`: the part named after `on`.
      const onPart = /^on-([a-z][a-z0-9-]*)$/.exec(label.word)?.[1];
      if (onPart && parts.includes(onPart))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${value}" names the part ${onPart}; a value for one part is given with --on ${onPart}.`,
          {run: [`${P} set ${slug} ${thing} ${q(rest)} --on ${onPart}`]},
        );
      if (parts.includes(label.word))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${label.word}" in "${value}" is a part; a value for one part is given with --on ${label.word}.`,
          {run: [`${P} set ${slug} ${thing} ${q(rest)} --on ${label.word}`]},
        );
      // A flag's own name as the label (`state: hover`, `part: card`,
      // `variant: primary`, `mode: dark`): what that flag does here.
      const flagWord = {
        state: 'state',
        states: 'state',
        part: 'on',
        on: 'on',
        component: 'on',
        variant: 'when',
        size: 'when',
        when: 'when',
        prop: 'when',
        mode: 'mode',
        theme: 'mode',
      }[label.word];
      if (
        flagWord &&
        (flagWord === 'mode'
          ? Boolean(modeNear(rest))
          : !otherSettingLabel(thing, value))
      ) {
        const r = rest.trim().toLowerCase();
        // The flag's value and the setting's value in one (`state=hover
        // 4px`): the first word is the flag's, the rest the value.
        const [fv, ...more] = rest.trim().split(/\s+/);
        if (flagWord !== 'mode' && more.length > 0) {
          const flagged =
            flagWord === 'on'
              ? ` --on ${fv}${flags.when ? ` --when ${flags.when}` : ''}`
              : flags.on
                ? `${scope} --${flagWord} ${flagWord === 'when' && label.word !== 'when' && label.word !== 'prop' ? `${label.word}:${fv}` : fv}`
                : null;
          refuse(
            E.ERR_THEME_BAD_VALUE,
            `"${value}" holds the ${flagWord} ${fv} and the value ${more.join(' ')}; the ${flagWord} is given with --${flagWord}.`,
            {
              didYouMean: [`--${flagWord}`],
              run: [
                flagged
                  ? `${P} set ${slug} ${thing} ${q(more.join(' '))}${flagged}`
                  : `${HOW} ${q(`${fv} ${thing}`)}`,
              ],
            },
          );
        }
        const m = flagWord === 'mode' ? modeNear(r) : null;
        const when =
          flagWord === 'when'
            ? label.word === 'when' || label.word === 'prop'
              ? r
              : `${label.word}:${r}`
            : null;
        refuse(
          E.ERR_THEME_BAD_VALUE,
          flagWord === 'mode'
            ? `"${value}" names ${m ? `the ${m} mode` : 'a mode'}, not a value for ${thing}: ${colorful ? `a value for one mode is given with --mode ${m ?? 'dark'}` : `a theme for one mode is set with \`set ${slug} mode ${m ?? 'dark'}-only\``}.`
            : flagWord === 'state'
              ? `"${value}" names a state, not a value for ${thing}: a value for a state is given with --on <part> --state ${r}.`
              : flagWord === 'on'
                ? `"${value}" names a part, not a value for ${thing}: a value for one part is given with --on ${r}.`
                : `"${value}" names a variant, not a value for ${thing}: a value for one variant is given with --on <part> --when ${when}.`,
          {
            didYouMean: [`--${flagWord}`],
            run: [
              flagWord === 'mode' && !colorful
                ? `${P} set ${slug} mode ${m ?? 'dark'}-only`
                : `${HOW} ${q(`${r} ${thing}`)}`,
            ],
          },
        );
      }
      // A Google Fonts family spec (`Inter:wght@400;600`): the family
      // before the colon.
      if (
        (thing === 'font' || familyToken || thing === 'font-family') &&
        /^(ital,)?wght@|^ital@/i.test(rest)
      ) {
        const family = String(value).split(':')[0].replace(/\+/g, ' ').trim();
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${value}" is a Google Fonts family spec; ${thing} takes the family (${family}). A weight is set with font-weight or a --font-weight-* token.`,
          {run: [`${P} set ${slug} ${thing} ${q(family)}${scope}`]},
        );
      }
      // A family's own words may hold a colon; only the words above are
      // read there.
      if (!familyToken && !otherSettingLabel(thing, value))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${label.word}" in "${value}" is not a name the editor reads for ${thing}; give the value alone.`,
          {
            // Only setting names: a part or a state is never a value.
            didYouMean: nearest(label.word, Object.keys(DIALS)),
            // The words after an unknown label are no value the person
            // gave (a typo before the colon, or a family with a colon in
            // it): only a known name is ever taken off. What it takes.
            run: [`${HOW} ${thing}`],
          },
        );
    }
    // The setting's own name before its value (`font: Inter`, `Font:
    // Georgia`) is the value.
    // (A `font:` shorthand is read whole below, as its family.)
    if (
      label &&
      ownLabel(thing, label.word) &&
      // A `font:` with a size is the shorthand, read whole below; with
      // only families (`font: Inter, serif`) it is the label.
      (label.word !== 'font' || !/\d/.test(label.rest)) &&
      label.rest.replace(/;+\s*$/, '').trim()
    )
      value = label.rest;
  }
  if (
    !unset &&
    typeof value === 'string' &&
    (DIALS[thing] || partProperty || thing.startsWith('--')) &&
    !/content/.test(thing)
  ) {
    // A value labeled with another setting's name is that setting's, never
    // this one's (`accent 'neutral: #64748b'`, `--radius-element 'accent:
    // red'`). The value goes to this setting again only for a dial that
    // checks it as its own (any word is a font family, so never the font).
    const other = otherSettingLabel(thing, value);
    if (other)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${value}" is labeled ${other.thing}, another setting than ${thing}; nothing is set from it.`,
        {
          didYouMean: [other.thing],
          run: [
            `${P} set ${slug} ${other.thing} ${quoteCommandArgument(other.value)}${flags.on ? ` --on ${flags.on}` : ''}`,
            // Another setting is not this part's property: the whole theme.
            ...(flags.on && partProperty
              ? [
                  `${P} set ${slug} ${other.thing} ${quoteCommandArgument(other.value)}`,
                ]
              : []),
            ...(DIALS[thing] && thing !== 'font'
              ? [
                  `${P} set ${slug} ${thing} ${quoteCommandArgument(other.value)}${flags.on ? ` --on ${flags.on}` : ''}`,
                ]
              : []),
          ],
        },
      );
  }
  if (!unset && typeof value === 'string' && DIALS[thing]) {
    const d = thing === 'font' ? null : pastedDeclaration(value);
    if (d?.value) value = d.value;
  }
  // The font dial's value as pasted from a stylesheet (`Georgia, serif;`,
  // a comment, `!important`): a refusal suggests the font it names, when
  // set takes that.
  // A font pasted with its property name is the family list it names.
  if (
    !unset &&
    typeof value === 'string' &&
    (thing === 'font' ||
      (thing.startsWith('--') && ctx.C.typeOf(thing) === 'font'))
  ) {
    const pasted = pastedFont(value);
    if (pasted === '')
      refuse(
        E.ERR_MISSING_ARGUMENT,
        `"${value.trim()}" names a font property but gives no font. Give the family after the colon, or alone.`,
        {
          run: [
            `${P} set ${slug} ${thing} ${quoteCommandArgument(thing === 'font' ? 'inter' : 'Inter, sans-serif')}${flags.on ? ` --on ${quoteCommandArgument(flags.on)}` : ''}`,
          ],
        },
      );
    if (pasted) value = pasted;
  }
  if (thing === 'font' && !unset && typeof value === 'string') {
    const meant = typedPlain(value)
      .replace(/;+\s*$/, '')
      .replace(/\s*!\s*important\s*$/i, '')
      .replace(/;+\s*$/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (meant && meant !== value.trim())
      try {
        return checkSettingAsTyped(ctx, slug, data, thing, value, flags);
      } catch (e) {
        try {
          checkSettingAsTyped(ctx, slug, data, thing, meant, flags);
        } catch {
          throw e;
        }
        if (e instanceof AstryxError)
          e.suggestions = [
            {
              name: `${P} set ${slug} font ${quoteCommandArgument(meant)}${flags.on ? ` --on ${quoteCommandArgument(flags.on)}` : ''}`,
              reason: 'do this instead',
            },
          ];
        throw e;
      }
  }
  const s = checkSettingAsTyped(
    ctx,
    slug,
    data,
    thing,
    value,
    flags,
    unset,
    reads,
    element,
  );
  // A var() with a fallback always gives a value; a name one slip from a
  // design token is noted as a likely typo, and the setting stands.
  if (!unset && typeof value === 'string' && !s.note) {
    const typo = fallbackVarTypo(value, ctx.project.core.tokenDefaults ?? {});
    if (typo) s.note = typo;
  }
  // A family kept as typed that is near a font a system ships: noted, as
  // the family may be a real one the editor does not know.
  if (
    !unset &&
    typeof value === 'string' &&
    !s.note &&
    (thing === 'font' ||
      thing === 'font-family' ||
      thing.startsWith('--font-family'))
  ) {
    /** @type {Array<{name: string, near: string, rung?: string, words?: string}>} */
    const near = [];
    fontListProblem(value, ctx, thing === 'font', near);
    if (near.length)
      s.note = near
        .map(
          n =>
            `"${n.name}" is kept as typed: the editor does not know that family, and ${n.words ? `its last words (${n.words}) name a ${n.rung ? 'weight' : 'style'}` : 'a font a system ships is spelled near it'}; if ${n.words ? `${n.words} was` : 'that was'} meant: ${P} set ${slug} ${thing} ${quoteCommandArgument(String(value).replace(n.name, n.near))}${flags.on ? ` --on ${flags.on}` : ''}${n.rung && thing === 'font' ? ` and ${P} set ${slug} headings ${n.rung}` : ''}`,
        )
        .join('; ');
  }
  return s;
}

/**
 * The part a value names beside the value (pasted from notes or typed as
 * words): a label (`card: #eee`, `button = red`, `button:hover: red` with a
 * state), `red on button`, or the part as the first or last word (`card
 * 8px`, `button red`); the part as --on reads it (a plural is its part),
 * with the value left and the state named. Null when no exact part or
 * group is named.
 * @param {any} ctx
 * @param {string} text
 * @returns {{on: string, value: string, state?: string} | null}
 */
function partInValue(ctx, text) {
  const partOf = (/** @type {string} */ w) => partNamed(ctx, w);
  const t = text.trim();
  /** @type {Array<[string, string, string?]>} part words, value, state */
  const readings = [];
  const label =
    /^([a-z][a-z -]*?)\s*(?::\s*([a-z][a-z-]*)\s*)?[:=]\s*(\S.*)$/i.exec(t);
  if (label) readings.push([label[1], label[3], label[2]]);
  const on = /^(\S.*?)\s+on\s+([a-z][a-z -]*)$/i.exec(t);
  if (on) readings.push([on[2], on[1]]);
  const words = t.split(/\s+/);
  if (words.length > 1) {
    readings.push([words[0], words.slice(1).join(' ')]);
    readings.push([words[words.length - 1], words.slice(0, -1).join(' ')]);
  }
  for (const [part, value, state] of readings) {
    const found = partOf(part);
    if (!found || !value.trim()) continue;
    const read = state ? stateSpelling(state) : undefined;
    if (state && !STATE_WORDS.includes(/** @type {string} */ (read))) continue;
    return {on: found, value: value.trim(), ...(read ? {state: read} : {})};
  }
  return null;
}

/**
 * The part or group a word names as --on reads it (a plural is its part:
 * `cards`, `buttons`), or null. The one reader for a part named inside a
 * value and a part typed in the setting's place.
 * @param {any} ctx
 * @param {string} w
 * @returns {string | null}
 */
export function partNamed(ctx, w) {
  const word = String(w).trim().toLowerCase().replace(/\s+/g, '-');
  return (
    [word, word.replace(/e?s$/, ''), word.replace(/s$/, '')].find(
      x => x && (ctx.project.target.has(x) || groupsOf(ctx)[x]),
    ) ?? null
  );
}

/**
 * A note for a var() with a fallback whose name is a letter or two off a
 * design token (`var(--spacing-xl, 2rem)` when the token is `--spacing-x1`):
 * the fallback shows until it is fixed. Null when there is none.
 * @param {string} v
 * @param {Record<string, unknown>} TOKENS
 */
function fallbackVarTypo(v, TOKENS) {
  for (const [, name] of v.matchAll(
    new RegExp(String.raw`var\(\s*(${CUSTOM_PROPERTY})\s*,`, 'gi'),
  )) {
    if (name in TOKENS || name.startsWith('--_')) continue;
    const near = nearest(name, Object.keys(TOKENS)).filter(n =>
      typoNear(name, n),
    );
    if (near.length)
      return `${name} is not a design token, so its fallback always shows; did you mean ${near[0]}?`;
  }
  return null;
}

/**
 * checkSetting for the value as typed.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} thing
 * @param {string | undefined} value
 * @param {SetFlags} flags
 * @param {boolean} [unset]
 * @param {ReadonlySet<string>} [reads] custom properties the theme sets where the value is read
 * @param {Record<string, unknown>} [element] the custom properties set on
 *   the element the value is set on, when that is not the theme's root (a
 *   surface's own tokens): only these can loop back to it
 * @returns {import('./_settings.mjs').Setting}
 */
function checkSettingAsTyped(
  ctx,
  slug,
  data,
  thing,
  value,
  flags,
  unset = false,
  reads = undefined,
  element = undefined,
) {
  const s = checkOne(
    ctx,
    slug,
    data,
    thing,
    value,
    flags,
    unset,
    reads,
    element,
  );
  const why = unset ? null : valueProblem(s);
  if (why)
    refuse(
      E.ERR_THEME_BAD_VALUE,
      /cannot be a CSS value$/.test(why)
        ? `${why}: it has a ; { } < > or a newline, a comment, !important, or an unclosed bracket or quote, so the browser would drop it.`
        : `${why}.`,
      {
        run: [
          s.thing === 'font'
            ? `${P} set ${slug} font inter${s.on ? ` --on ${s.on}` : ''}`
            : `${HOW} ${s.thing}`,
        ],
      },
    );
  return s;
}

/**
 * The checks of one setting, before the loader's (see checkSetting).
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').ThemeData} data
 * @param {string} thing
 * @param {string | undefined} value
 * @param {SetFlags} flags
 * @param {boolean} unset
 * @param {ReadonlySet<string>} [reads] custom properties the theme sets where the value is read
 * @param {Record<string, unknown>} [element] the custom properties set on the element the value is set on, when that is not the theme's root
 * @returns {import('./_settings.mjs').Setting}
 */
function checkOne(
  ctx,
  slug,
  data,
  thing,
  value,
  flags,
  unset,
  reads,
  element = undefined,
) {
  const {C} = ctx;
  const TARGET = ctx.project.target;
  const TOKENS = ctx.project.core.tokenDefaults;
  if (!thing)
    refuse(E.ERR_MISSING_ARGUMENT, 'Name the thing to change.', {
      run: [`${P} ${unset ? 'undo' : 'set'} --help`],
    });
  // `--token=value` is one word to the shell: say how to write it.
  if (thing.startsWith('--') && thing.includes('=')) {
    const [name, ...rest] = thing.split('=');
    refuse(
      E.ERR_MISSING_ARGUMENT,
      `Give the token and its value as two words: ${name} ${rest.join('=')}.`,
      {
        run: [
          `${P} ${unset ? 'undo' : 'set'} ${slug} ${name}${unset ? '' : ` ${quoteCommandArgument(rest.join('='))}`}`,
        ],
      },
    );
  }
  if (!unset && (value === undefined || value.trim() === ''))
    refuse(E.ERR_MISSING_ARGUMENT, `Give a value for ${thing}.`, {
      run: [`${P} set --help`],
    });
  // An empty flag is never read as no flag: --state '' would reach every
  // state.
  for (const k of /** @type {const} */ (['on', 'when', 'state', 'mode']))
    if (flags[k] === '')
      refuse(E.ERR_MISSING_ARGUMENT, `--${k} was given no value.`, {
        run: [`${P} ${unset ? 'undo' : 'set'} --help`],
      });
  // A value pasted over several lines is one value; a dial's number typed
  // with the dial's unit (`text-size 24px`) is that number.
  const v = DIALS[thing]
    ? dialNumber(thing, normalValue(thing, value ?? ''))
    : normalValue(thing, value ?? '');
  // A var() that misspells a design token would read nothing.
  if (!unset) {
    const bad = unknownVarRef(v, TOKENS, thing, reads);
    if (bad)
      refuse(E.ERR_THEME_UNKNOWN_TOKEN, bad.message, {
        didYouMean: bad.near,
        run: [
          ...(bad.fixed
            ? [
                `${P} set ${slug} ${quoteCommandArgument(thing)} ${quoteCommandArgument(bad.fixed)}${/** @type {const} */ (['on', 'state', 'when', 'mode']).map(k => (flags[k] ? ` --${k} ${quoteCommandArgument(String(flags[k]))}` : '')).join('')}`,
              ]
            : []),
          bad.close
            ? `${HOW} --list tokens ${bad.near[0].replace(/^--/, '').split('-')[0]}`
            : `${HOW} --list tokens`,
        ],
      });
  }
  // A placeholder copied from a suggestion is not a value.
  if (!unset && /<[a-z][\w -]*>/i.test(v))
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${v}" is a placeholder: put a real value in place of ${/<[a-z][\w -]*>/i.exec(v)?.[0]}.`,
      {run: [`${HOW} ${thing.replace(/^--/, '')}`]},
    );
  /** @type {import('./_settings.mjs').Setting} */
  const s = {thing, value: v, source: 'dial'};
  // A flag given only spaces names nothing; it is never read as absent.
  for (const k of /** @type {const} */ (['on', 'when', 'state', 'mode']))
    if (typeof flags[k] === 'string' && flags[k].trim() === '')
      refuse(E.ERR_MISSING_ARGUMENT, `--${k} is empty.`, {
        run: [
          k === 'mode'
            ? `${P} set ${slug} ${thing} ${quoteCommandArgument(v || '#1f2937')}`
            : `${HOW} --list parts`,
        ],
      });
  if (flags.on) s.on = flags.on.trim();
  // (Several conditions in one order, by prop, so an undo or a change
  // later finds them whatever order they were typed in.)
  if (flags.when)
    s.when = flags.when
      .trim()
      .split(/\s*\+\s*/)
      .sort()
      .join('+');
  // A state in any case or spelling of its words (focusVisible,
  // focus_visible, 'focus visible') is the state, written as CSS writes it.
  if (flags.state) s.state = stateSpelling(flags.state);
  if (flags.only) s.only = true;
  if (flags.mode) {
    // Read as any value is: invisible or no-break spaces, quotes around
    // it, a trailing colon (`'dark '`, `“dark”`, `dark:`).
    const mode = withoutDebris(normalValueText(String(flags.mode)))
      .trim()
      .replace(/^(["'])(.*)\1$/, '$2')
      .replace(/:+$/, '')
      .trim()
      .toLowerCase();
    if (mode !== 'light' && mode !== 'dark') {
      // A word that names one of the two (dark-only, darkmode, night) is
      // that one, by the one mode reader; never the nearest spelling, which
      // can be the other (night → light).
      const meant = modeNear(mode);
      const near = meant ? [meant] : nearest(mode, ['light', 'dark']);
      // The line for that one mode: for a dial, the one `--mode dark` itself
      // offers (the color token for that mode), never the both-modes dial.
      const modeLine = (/** @type {string} */ m) => {
        if (DIALS[thing] && !unset)
          try {
            checkSetting(ctx, slug, data, thing, v, {...flags, mode: m});
          } catch (e) {
            const first = /** @type {any} */ (e)?.suggestions?.find(
              (/** @type {any} */ x) => / --mode (light|dark)\b/.test(x.name),
            );
            if (first) return first.name;
          }
        return setLine(slug, thing, v, {...s, mode: m}, unset);
      };
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `--mode takes light or dark, not "${flags.mode}".`,
        {
          didYouMean: near,
          // The mode it is nearest keeps --mode; only with none near is the
          // same setting for both modes offered.
          run: [
            ...(near.length === 1 ? [modeLine(near[0])] : []),
            // A word that means one mode (night) keeps it: the both-modes
            // line only for a word read by spelling.
            ...(meant
              ? []
              : [setLine(slug, thing, v, {...s, mode: undefined}, unset)]),
          ],
        },
      );
    }
    s.mode = mode;
  }
  const onFlag = s.on ? ` --on ${s.on}` : '';
  // A CSS-wide keyword is no color for one mode: a mode's half takes a
  // color, and the keyword applies to the whole declaration, in both modes.
  if (
    s.mode &&
    !unset &&
    CSS_WIDE.includes(
      String(v ?? '')
        .trim()
        .toLowerCase(),
    )
  )
    // A token takes no keyword in any mode (it would be left empty), so for
    // a token only the color is offered.
    refuse(
      E.ERR_THEME_NO_MODE,
      String(thing).startsWith('--')
        ? `"${String(v).trim()}" is a CSS keyword, which applies in both modes, so it takes no --mode; and a token never takes one. Give the ${s.mode} color.`
        : `"${String(v).trim()}" is a CSS keyword, which applies in both modes, so it takes no --mode. Give the ${s.mode} color, or set ${thing} ${String(v).trim()} for both modes.`,
      {
        run: [
          String(thing).startsWith('--')
            ? `${HOW} ${thing}`
            : `${P} set ${slug} ${thing} ${String(v).trim()}${onFlag}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}`,
        ],
      },
    );
  // A value that already gives both modes takes no --mode (a gradient
  // holding a light-dark() stop included).
  if (
    s.mode &&
    !unset &&
    (/^\s*light-dark\(/i.test(v ?? '') ||
      (/gradient\(/i.test(v ?? '') && /light-dark\(/i.test(v ?? '')))
  )
    refuse(
      E.ERR_THEME_NO_MODE,
      `"${v}" already gives both modes, so it takes no --mode; drop --mode, or give the ${s.mode} color alone.`,
      {
        run: [
          `${P} set ${slug} ${thing} ${quoteCommandArgument(String(v))}${s.on ? ` --on ${s.on}` : ''}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}`,
        ],
      },
    );
  // A setting saved for a mode the theme no longer has can still be removed.
  // An entry saved for the one mode the theme has ("[dark only]" in a
  // dark-only theme) can be set again with that --mode, so a doubled one
  // can be kept: that set replaces both.
  const sameModeEntry =
    s.mode &&
    data.mode === `${s.mode}-only` &&
    (Array.isArray(data.settings) ? data.settings : []).some(
      (/** @type {any} */ x) =>
        x &&
        x.thing === thing &&
        x.mode === s.mode &&
        (x.on ?? null) === (s.on ?? null) &&
        (x.when ?? null) === (s.when ?? null) &&
        (x.state ?? null) === (s.state ?? null),
    );
  // A one-mode theme still has the other mode where Core draws it (a toast,
  // a lightbox): a value for that mode is written for those regions.
  const otherModeOfOneMode =
    s.mode != null &&
    oneModeOfTheme(data) != null &&
    oneModeOfTheme(data) !== s.mode;
  // The theme's own mode named on a one-mode theme (`--mode dark` on a
  // dark-only theme) is the same as no --mode: read so, as undo reads it,
  // and said. What takes no --mode in any theme (a size, a font,
  // a keyword) is still refused for that, with the line without --mode.
  if (s.mode && data.mode !== 'both' && !sameModeEntry && !otherModeOfOneMode) {
    if (!unset)
      try {
        checkSetting(ctx, slug, {...data, mode: 'both'}, thing, v, flags);
      } catch (e) {
        if (/** @type {any} */ (e)?.code === E.ERR_THEME_NO_MODE) throw e;
      }
    const own = s.mode;
    s.mode = undefined;
    if (!unset)
      s.note = `${slug} is ${data.mode}: --mode ${own} is its own mode, the same as no --mode`;
  }
  if ((s.when || s.state) && !s.on)
    refuse(E.ERR_MISSING_ARGUMENT, '--when and --state need --on <part>.', {
      run: [`${HOW} --list parts`],
    });
  // --only is checked on a part this Core has; a part in other letters or
  // misspelt gets the part's own refusal first, with --only kept.
  // --only keeps a change to the part named. On a group itself, or with no
  // part, it names nothing to keep to, and is refused. On a part that is
  // styled on its own already (a part in no group that spreads, such as a
  // sub-part or a member of a group that spreads only when named), it asks
  // for what the change does anyway: the change is made, without it, and
  // said, so the escape always works.
  if (s.only && (!s.on || TARGET.has(s.on) || groupsOf(ctx)[s.on])) {
    const fam = s.on ? familyOf(s.on) : null;
    if (!s.on || groupsOf(ctx)[s.on])
      refuse(
        E.ERR_INVALID_ARGUMENT,
        '--only is for one member of a group, such as text-input (how --list groups).',
        {run: [`${HOW} --list groups`]},
      );
    if (!fam || !AUTO_SPREAD.includes(fam)) {
      s.only = undefined;
      if (!unset)
        s.note = `${s.on} is styled on its own already (only the ${AUTO_SPREAD.join(' and ')} groups spread), so --only changes nothing: it is saved without it`;
    }
  }
  // A font role in other letters (Body, CODE) is that role.
  if (
    thing === 'font' &&
    s.on &&
    !FONT_ROLES.includes(s.on) &&
    FONT_ROLES.includes(s.on.toLowerCase())
  )
    refuse(
      E.ERR_THEME_UNKNOWN_PART,
      `"${s.on}" is the ${s.on.toLowerCase()} font role, written in lowercase.`,
      {
        didYouMean: [s.on.toLowerCase()],
        run: [setLine(slug, thing, v, {...s, on: s.on.toLowerCase()}, unset)],
      },
    );
  const isRole = thing === 'font' && FONT_ROLES.includes(s.on ?? '');
  if (s.on && !isRole && !groupsOf(ctx)[s.on]) {
    const t = TARGET.get(s.on);
    if (!t) {
      // Another case of a part or group, its class name copied from the
      // page (`.astryx-card`), or its component (`<Card>`, `Card`): that
      // part, as a working command with every flag kept.
      // Stray punctuation from a copied list ("text-input,") and the dashes
      // autocorrect types ("text\u2013input") are not part of the name.
      const lower = s.on
        .replace(/[\u2010-\u2015\u2212]/g, '-')
        .replace(/^[\s,;:.'"`]+|[\s,;:.'"`]+$/g, '')
        .trim()
        .replace(/^<\/?\s*|\s*\/?>$/g, '')
        .replace(/^\./, '')
        .replace(/^astryx-/, '')
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .toLowerCase();
      // A part named in words (dialog header, text inputs) is the dashed
      // part, read before any group a single word of it names.
      const dashed = lower.trim().replace(/[\s_]+/g, '-');
      // A plain word how reads as a part or group (checkboxes: checks):
      // only the whole value as one word, never one word inside a longer
      // name (nmber-input is no word for inputs).
      const byWord = /^[a-z]+$/.test(lower) ? partForWord(lower) : null;
      // A typo of a whole part or group name, or of a word how reads as
      // one (sidebar, checkbox, toggle), is the part the nearest of them
      // names, when the nearest name one part.
      const typoParts = (() => {
        const words = partWords();
        const candidates = [
          ...TARGET.keys(),
          ...Object.keys(groupsOf(ctx)),
          ...[...words]
            .filter(([, on]) => TARGET.has(on) || groupsOf(ctx)[on])
            .map(([w]) => w),
        ].filter(n => n !== lower && n !== dashed);
        // The one typo ranker (closestOf). A hit that is a part or group
        // name is that name (`tabel` is table); a word that is no name is
        // read as its part (`sidebr` is side-nav).
        const isName = (/** @type {string} */ n) =>
          TARGET.has(n) || Boolean(groupsOf(ctx)[n]);
        return [
          ...new Set(
            closestOf(dashed, candidates).map(n =>
              isName(n) ? n : (words.get(n) ?? n),
            ),
          ),
        ];
      })();
      // A plain plural of a part (cards, dialogs, tabs) is that part.
      const singular = [lower, dashed]
        .flatMap(w => [
          w.replace(/ies$/, 'y'),
          w.replace(/(ch|sh|x|s)es$/, '$1'),
          w.replace(/s$/, ''),
        ])
        .find(x => x !== lower && (TARGET.has(x) || groupsOf(ctx)[x]));
      // Several parts named in one --on (`button, text-input`, `button/
      // text-input`, `button and text-input`, or spaces): one command per
      // part named, each checked, never a group that one word of the list
      // happens to name.
      const listed = /,|\/|&|\band\b/.test(lower);
      // (Words with only spaces that name one part, `text inputs`, are
      // that part.)
      if (
        !(TARGET.has(dashed) || groupsOf(ctx)[dashed]) &&
        (listed || !singular)
      ) {
        const pieces = lower
          .split(/\s*(?:,|\/|&|\band\b)\s*|\s+/)
          .map(x => x.trim())
          .filter(Boolean);
        const partOf = (/** @type {string} */ w) =>
          TARGET.has(w) || groupsOf(ctx)[w]
            ? w
            : ([w.replace(/ies$/, 'y'), w.replace(/s$/, '')].find(
                x => x !== w && (TARGET.has(x) || groupsOf(ctx)[x]),
              ) ?? null);
        const found = pieces.map(partOf);
        const parts = [...new Set(found.filter(x => x != null))];
        const missing = pieces.filter((_, i) => found[i] == null);
        if (
          pieces.length > 1 &&
          parts.length > 0 &&
          (missing.length === 0 || (listed && parts.length > 1))
        )
          refuse(
            E.ERR_THEME_UNKNOWN_PART,
            `"${s.on}" names ${pieces.length} parts; --on takes one part at a time${missing.length ? ` (${missing.map(x => `"${x}"`).join(', ')} is not a part you can style)` : ''}.`,
            {
              didYouMean: parts,
              run: parts
                .slice(0, 6)
                .map(on => setLine(slug, thing, v, {...s, on}, unset)),
            },
          );
      }
      const named =
        TARGET.has(lower) || groupsOf(ctx)[lower]
          ? lower
          : TARGET.has(dashed) || groupsOf(ctx)[dashed]
            ? dashed
            : singular
              ? singular
              : typoParts.length === 1
                ? typoParts[0]
                : byWord && (TARGET.has(byWord) || groupsOf(ctx)[byWord])
                  ? byWord
                  : null;
      // The page (the body behind every part) is painted by the app shell.
      if (
        !named &&
        /^(page|body|app|background|page-background)$/i.test(s.on) &&
        TARGET.has('app-shell')
      )
        refuse(
          E.ERR_THEME_UNKNOWN_PART,
          `"${s.on}" is not a part name; the page behind your parts is app-shell (a background there shows in every AppShell variant).`,
          {
            didYouMean: ['app-shell'],
            run: [setLine(slug, thing, v, {...s, on: 'app-shell'}, unset)],
          },
        );
      if (named)
        refuse(
          E.ERR_THEME_UNKNOWN_PART,
          `"${s.on}" is not a part name; the part is ${named}.`,
          {
            didYouMean: [named],
            run: [setLine(slug, thing, v, {...s, on: named}, unset)],
          },
        );
      // A name that is a part's name with a piece of it after (a top nav
      // heading's title, `top-nav-heading-title`) means that part: the
      // longest part name it starts with. A text property its inner
      // elements read from tokens is offered as those tokens there.
      const holder = [...TARGET.keys()]
        .filter(n => dashed.startsWith(`${n}-`))
        .sort((a, b) => b.length - a.length)[0];
      if (holder) {
        const toks = innerPropTokens(ctx.C, holder, kebab(thing));
        refuse(
          E.ERR_THEME_UNKNOWN_PART,
          `"${s.on}" is not a part name; what it names is drawn inside ${holder}, the part to set it on${toks.length ? `, where its ${kebab(thing)} comes from ${toks.join(', ')}` : ''}.`,
          {
            didYouMean: [holder],
            run: toks.length
              ? toks.map(tok =>
                  setLine(slug, tok, v, {...s, on: holder}, unset),
                )
              : [setLine(slug, thing, v, {...s, on: holder}, unset)],
          },
        );
      }
      // A plural or another case names the part it means; a typo of one
      // part leads with the same command on that part.
      const near = nearest(s.on.toLowerCase().replace(/s$/, ''), [
        ...TARGET.keys(),
        ...Object.keys(groupsOf(ctx)),
      ]);
      const typo = near.filter(n => typoOf(lower, n));
      refuse(
        E.ERR_THEME_UNKNOWN_PART,
        `"${s.on}" is not a part you can style.`,
        {
          didYouMean: near,
          run: [
            ...(typo.length === 1
              ? [setLine(slug, thing, v, {...s, on: typo[0]}, unset)]
              : []),
            `${HOW} --list parts ${quoteCommandArgument(lower.replace(/s$/, '').split('-')[0] || 'button')}`,
            `${HOW} ${quoteCommandArgument(s.on)}`,
          ],
        },
      );
    }
    if (s.when) {
      const variants = C.variantValues(s.on);
      const conditions = Object.keys(variants);
      // Several conditions, one per prop (`variant:ghost+size:sm`): each is
      // checked as one alone is, and a line that fixes one keeps the rest.
      const pieces = String(s.when).split('+');
      /** @param {number} i @param {string} w */
      const withPiece = (i, w) =>
        pieces.map((x, j) => (j === i ? w : x)).join('+');
      const seenProps = new Set();
      for (const [i, when] of pieces.entries()) {
        const reading = whenReading(when, t.props, variants);
        // A prop and value in other letters, with spaces or `=` between
        // (`Variant: Primary`, `variant=primary`): the working command.
        if (reading.written)
          refuse(
            E.ERR_THEME_UNKNOWN_VARIANT,
            `--when "${when}" is written ${reading.written}.`,
            {
              didYouMean: [withPiece(i, reading.written)],
              run: [
                setLine(
                  slug,
                  thing,
                  v,
                  {...s, when: withPiece(i, reading.written)},
                  unset,
                ),
              ],
            },
          );
        const [p, wv, ...more] = when.split(':');
        if (!wv || more.length)
          refuse(
            E.ERR_THEME_BAD_VALUE,
            '--when takes <prop>:<value>, such as variant:primary.',
            {run: [`${HOW} ${s.on}`]},
          );
        if (seenProps.has(p))
          refuse(
            E.ERR_THEME_BAD_VALUE,
            `--when names ${p} twice (${s.when}); a part has one ${p} at a time.`,
            {run: [`${HOW} ${s.on}`]},
          );
        seenProps.add(p);
        const whenRun = reading.meant
          ? [
              setLine(
                slug,
                thing,
                v,
                {...s, when: withPiece(i, reading.meant)},
                unset,
              ),
            ]
          : [];
        if (!t.props.includes(p) && !conditions.includes(p))
          refuse(
            E.ERR_THEME_UNKNOWN_VARIANT,
            `${s.on} has no prop "${p}". It has: ${t.props.join(', ') || 'none'}.`,
            {
              didYouMean: nearest(p, t.props),
              run: [...whenRun, `${HOW} ${s.on}`],
            },
          );
        const vals = variants[p] ?? [];
        if (vals.length && !vals.includes(wv))
          refuse(
            E.ERR_THEME_UNKNOWN_VARIANT,
            `${s.on} has no ${p} "${wv}". ${p} is one of: ${vals.join(', ')}.`,
            {
              didYouMean: nearest(wv, vals),
              run: [...whenRun, `${HOW} ${s.on}`],
            },
          );
      }
    }
    const states = partStates(ctx, s.on);
    // A state the part lists in camelCase (toggle-button's isPressed) typed
    // in any case or with dashes is that state; a state typed by its prop
    // name or its ARIA attribute (`isPressed`, `aria-pressed` on a button,
    // `isSelected` on a tab) is the state of that name.
    if (s.state) s.state = partState(ctx, s.on, s.state);
    // Several states in one --state (`hover,focus-visible`, `hover
    // focus-visible`): one line per state, the value quoted as typed.
    const typedStates = String(flags.state ?? '')
      .split(/\s*(?:,|\/|&|\band\b)\s*|\s+/)
      .map(x => x.trim().toLowerCase())
      .filter(Boolean);
    if (
      typedStates.length > 1 &&
      typedStates.every(x => states.includes(x)) &&
      !states.includes(String(s.state))
    )
      refuse(
        E.ERR_THEME_UNKNOWN_STATE,
        `"${flags.state}" names ${typedStates.length} states; --state takes one at a time.`,
        {
          didYouMean: typedStates,
          run: typedStates
            .slice(0, 6)
            .map(state => setLine(slug, thing, v, {...s, state}, unset)),
        },
      );
    const meant = s.state ? stateMeant(s.state, states) : null;
    // Several states at once (`checked+disabled`): each the part's, and
    // painted together by Core somewhere, else nothing would match.
    if (
      s.state &&
      s.state.includes('+') &&
      statesHold(states, s.state) &&
      !paintedTogether(ctx, s.on, s.state.split('+'))
    )
      refuse(
        E.ERR_THEME_UNKNOWN_STATE,
        `Core never paints ${s.on} ${s.state.split('+').join(' and ')} at once, so a change there would match nothing. Name one state at a time.`,
        {
          run: s.state
            .split('+')
            .slice(0, 4)
            .map(state => setLine(slug, thing, v, {...s, state}, unset)),
        },
      );
    // A negated state (`unpressed`) is the part at rest: the same line with
    // no --state, never the state it denies.
    const denied =
      s.state && !statesHold(states, s.state)
        ? negatedState(s.state, states)
        : null;
    if (denied)
      refuse(
        E.ERR_THEME_UNKNOWN_STATE,
        `"${s.state}" is not a state of ${s.on}: it names ${s.on} when it is not ${denied}, its rest look, which a setting with no --state gives.`,
        {run: [setLine(slug, thing, v, {...s, state: undefined}, unset)]},
      );
    if (s.state && !statesHold(states, s.state)) {
      // A part drawn inside this one that has the state (a calendar's day
      // is today; the calendar is not; a pagination's page button is the
      // current one): that part's line, with the state. Its own pieces
      // first, then the parts the census finds drawn inside it.
      const state = String(s.state);
      const holds = (/** @type {string} */ k) =>
        statesHold(partStates(ctx, k), state);
      const inner = meant
        ? []
        : [
            ...new Set([
              ...[...ctx.project.target.keys()].filter(k =>
                k.startsWith(`${s.on}-`),
              ),
              ...(ctx.C.MAP[String(s.on)]?.contains ?? []),
            ]),
          ]
            .filter(k => ctx.project.target.has(k) && holds(k))
            .slice(0, 3);
      refuse(
        E.ERR_THEME_UNKNOWN_STATE,
        `"${s.state}" is not a state of ${s.on}. States: ${settableStates(ctx, slug, data, s.on).join(', ') || 'none'}.${inner.length ? ` ${inner.join(', ')} ${inner.length > 1 ? 'have' : 'has'} it.` : ''}`,
        {
          ...(meant ? {didYouMean: [meant]} : {}),
          run: [
            ...(meant
              ? [setLine(slug, thing, v, {...s, state: meant}, unset)]
              : inner.map(k => setLine(slug, thing, v, {...s, on: k}, unset))),
            ...(meant ? [] : [`${HOW} ${quoteCommandArgument(s.on)}`]),
          ],
        },
      );
    }
  }
  {
    // A fill or text color a part's own element never declares, which an
    // element inside it paints from a token (a keyboard key's chip, a list
    // item's label text): the property set on the part is painted over
    // there, so it would never show. The token, set on the part, reaches the inner element.
    const prop = String(s.thing);
    if (
      !unset &&
      s.on &&
      !String(s.thing).startsWith('--') &&
      !groupsOf(ctx)[s.on] &&
      /^(background(-color)?|color)$/.test(prop)
    ) {
      const rec = ctx.C.MAP[s.on];
      const props =
        prop === 'background' || prop === 'background-color'
          ? ['background', 'background-color']
          : [prop];
      const innerToks = Object.entries(rec?.inside ?? {})
        .filter(([, ps]) =>
          /** @type {string[]} */ (ps).some(x => props.includes(x)),
        )
        .map(([t]) => t)
        .filter(t => /^--color-/.test(t));
      // (A media surface inside a part, a toast's, sets the text tokens of
      // what it holds from the color set on the part: never painted over.)
      if (
        rec &&
        !rec.media &&
        innerToks.length &&
        !props.some(x => rec.own?.[x]) &&
        !(rec.line ?? []).some((/** @type {string} */ x) => props.includes(x))
      )
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${s.on} draws no ${prop} of its own: an element inside it paints it from ${innerToks.join(', ')}, which paints over a ${prop} set on ${s.on}, so it would never show.`,
          {
            run: innerToks
              .slice(0, 2)
              .map(t => setLine(slug, t, v, {...s, only: undefined}, unset)),
          },
        );
    }
  }
  // A part drawn under an invisible native input (a checkbox's box, a
  // switch): the input takes the pointer and the focus, so a hover, press
  // or focus state on the part's own element never applies. Named with the
  // part that holds the input, where those states land.
  if (
    !unset &&
    s.on &&
    /^(hover|active|focus|focus-visible|focus-within)$/.test(String(s.state))
  ) {
    const all = partsOf(ctx, s);
    // (A part whose input sits in a part the theme names takes the state
    // from that part, and the build writes it so; only one whose input no
    // themed part holds is refused.)
    const under = all.filter(t => ctx.C.MAP[t]?.underInput === '');
    if (under.length && under.length === all.length) {
      const holders = [
        ...new Set(under.map(t => ctx.C.MAP[t]?.underInput).filter(Boolean)),
      ];
      refuse(
        E.ERR_THEME_NO_EFFECT,
        `${under.join(', ')} ${under.length > 1 ? 'are' : 'is'} drawn under an invisible input that takes the pointer and the focus, so --state ${s.state} on ${under.length > 1 ? 'them' : 'it'} would never apply${holders.length ? `; the input is inside ${holders.join(', ')}, where ${s.state} lands` : ''}.`,
        {
          // (A token: set on the part with no state, it is what Core reads
          // when it paints that state from the input, the focus ring's
          // color or the hover tint; a property would paint at rest.)
          run: [
            ...(String(thing).startsWith('--')
              ? [setLine(slug, thing, v, {...s, state: undefined}, unset)]
              : []),
            `${HOW} ${quoteCommandArgument(String(s.on))}`,
          ],
        },
      );
    }
  }
  // A part whose styled element is a wrapper (a text input's box) shows
  // focus only through focus-within: focus or focus-visible there would
  // never apply. Named the way `how` names it.
  if (!unset && s.on && (s.state === 'focus' || s.state === 'focus-visible')) {
    const parts = partsOf(ctx, s).filter(t => focusStateOf(ctx, t));
    if (
      parts.length &&
      parts.every(t => focusStateOf(ctx, t) === 'focus-within')
    )
      refuse(
        E.ERR_THEME_NO_EFFECT,
        `${s.on} shows focus on its box, around the field itself, so ${s.state} never applies there; focus-within does (the box while the field inside has focus).`,
        {
          didYouMean: ['focus-within'],
          run: [setLine(slug, thing, v, {...s, state: 'focus-within'}, unset)],
        },
      );
  }
  // A state that depends on the element applies only where it can: focus
  // where Core's own styles key on it, disabled on a part whose component
  // takes a disabled prop (Core marks it with aria-disabled, which the
  // theme's selector matches too), never on a part with no styles of its
  // own.
  if (
    !unset &&
    !ctx.unchecked &&
    s.on &&
    s.state &&
    ['disabled', 'focus', 'focus-visible', 'focus-within', 'active'].includes(
      s.state,
    )
  ) {
    const parts = partsOf(ctx, s);
    const own = (/** @type {string} */ t) => ctx.C.MAP[t]?.own ?? {};
    const keys = (/** @type {string} */ t, /** @type {string} */ st) =>
      JSON.stringify(own(t)).includes(`:${st}`);
    const states = (/** @type {string} */ t) =>
      ctx.project.target.get(t)?.states ?? [];
    // The part's component, or the one named like the part (tab is Tab,
    // under TabList), takes a disabled prop.
    const disables = (/** @type {string} */ t) => {
      // Or its built module sets aria-disabled (a tab takes it through its
      // other props): what Core renders, read from Core itself.
      const marks = (/** @type {string} */ n, /** @type {any} */ doc) => {
        const at = doc?.importPath?.split('/').pop();
        const file =
          at && ctx.project.coreDir
            ? path.join(ctx.project.coreDir, 'dist', at, `${n}.js`)
            : null;
        try {
          return file
            ? fs.readFileSync(file, 'utf8').includes('aria-disabled')
            : false;
        } catch {
          return false;
        }
      };
      return partComponentDocs(ctx, t).some(
        ({name, doc}) =>
          Object.keys(doc.props ?? {}).some(p => /disabled/i.test(p)) ||
          marks(name, doc),
      );
    };
    // A part holds content that can take focus, so focus-within applies
    // there: its component takes children or elements in a prop (a dialog,
    // a section, a chat composer's input).
    const holdsContent = (/** @type {string} */ t) =>
      partComponentDocs(ctx, t).some(({doc}) =>
        Object.entries(doc.props ?? {}).some(
          ([k, v]) =>
            k === 'children' ||
            /\bReact(Node|Element)\b/.test(
              String(/** @type {any} */ (v)?.type ?? ''),
            ),
        ),
      );
    // A part Core never styles in focus is not what takes focus (the
    // focusable element is inside it, or beside it).
    const focusable = (/** @type {string} */ t) =>
      /:focus(?!-within)/.test(JSON.stringify(own(t)));
    const dead = parts.filter(
      t =>
        !states(t).includes(/** @type {string} */ (s.state)) &&
        ((Object.keys(own(t)).length === 0 &&
          !(s.state === 'focus-within' && holdsContent(t))) ||
          ((s.state === 'focus' || s.state === 'focus-visible') &&
            !focusable(t)) ||
          (s.state === 'disabled' &&
            !keys(t, 'disabled') &&
            !JSON.stringify(own(t)).includes('aria-disabled') &&
            !disables(t)) ||
          (s.state === 'active' && !keys(t, 'active')) ||
          // focus-within on a part Core never styles that way: nothing
          // focusable is inside it (a switch's input sits beside its track).
          (s.state === 'focus-within' &&
            !keys(t, 'focus-within') &&
            !focusable(t) &&
            !holdsContent(t))),
    );
    if (parts.length && dead.length === parts.length) {
      const bare = Object.keys(own(dead[0])).length === 0;
      const within = keys(dead[0], 'focus-within');
      // A ring Core draws inline on the part at focus time (an indicator's)
      // is changed by its token, with no state.
      const inlineAlways = ctx.C.MAP[dead[0]]?.inline?.[''] ?? {};
      const ringToken = /^focus/.test(s.state)
        ? (inlineAlways[kebab(thing)] ??
          (Object.values(inlineAlways).includes(thing) ? thing : null))
        : null;
      refuse(
        E.ERR_THEME_NO_EFFECT,
        bare
          ? `${s.on} has no styles of its own (its looks come from the parts inside it), so --state ${s.state} never applies on it.`
          : s.state === 'active'
            ? `Core never styles ${s.on} while it is pressed, so --state active never applies on it.`
            : s.state === 'disabled'
              ? `${s.on} is never marked disabled (its component takes no disabled prop, and Core never styles it disabled), so --state disabled never applies on it.`
              : s.state === 'focus-within'
                ? `nothing inside ${s.on} takes focus (what takes focus sits beside it), so --state focus-within never applies on it.`
                : `${s.on} never takes focus itself (what takes focus is inside it or beside it), so --state ${s.state} never applies on it.${within ? ' focus-within does: the part while something inside it has focus.' : ''}`,
        {
          ...(within && !bare && /^focus/.test(s.state)
            ? {didYouMean: ['focus-within']}
            : {}),
          ...(ringToken
            ? {
                also: [
                  `Core draws ${dead[0]}'s focus ring at focus time from ${ringToken}, set on the part with no state`,
                ],
              }
            : {}),
          run: [
            ringToken
              ? `${P} set ${slug} ${ringToken} ${quoteCommandArgument(v)} --on ${s.on}${s.mode ? ` --mode ${s.mode}` : ''}`
              : within && !bare && /^focus/.test(s.state)
                ? setLine(slug, thing, v, {...s, state: 'focus-within'}, unset)
                : bare
                  ? `${HOW} --list parts ${s.on.split('-')[0]}`
                  : `${HOW} ${quoteCommandArgument(s.on)}`,
          ],
        },
      );
    }
  }
  // Core expands a part's padding into its container tokens from a plain
  // padding only, so in a state that padding never reaches what sits edge
  // to edge inside it: refused, judged on the part named (a group member
  // spreads; when only another member is the reason, --only keeps it to
  // the part named).
  if (!unset && s.on && s.state && ctx.derived) {
    // A padding property goes through the padding model, which writes a
    // state's own side variables; the spacing dial does not.
    const prop = thing === 'spacing' ? 'padding' : null;
    const expands = (/** @type {string} */ t) =>
      (ctx.derived?.[t] ?? []).some(
        d => d.property === prop && d.expand === 'container',
      );
    const named = ctx.project.target.get(s.on) ? s.on : null;
    const hit = prop
      ? named && expands(named)
        ? named
        : partsOf(ctx, s).find(expands)
      : undefined;
    if (hit)
      refuse(
        E.ERR_THEME_NO_EFFECT,
        `Core sets ${hit}'s inner padding (what sits edge to edge inside it) from a plain padding setting only, so with --state ${s.state} it would stay behind.`,
        {
          // The value as set takes it: a bare number in px.
          run: (() => {
            const fixed =
              thing === 'spacing' ? v : (propertyProblem(thing, v)?.near ?? v);
            return [
              named && !expands(named) && !s.only
                ? setLine(slug, thing, fixed, {...s, only: true})
                : setLine(slug, thing, fixed, {...s, state: undefined}),
            ];
          })(),
        },
      );
  }
  // On a group, a variant or state must belong to at least one member.
  if (s.on && groupsOf(ctx)[s.on] && (s.when || s.state)) {
    const members =
      /** @type {Array<[string, import('../../foundation/discovery/theming-targets.mjs').ThemingTarget]>} */ (
        (groupsOf(ctx)[s.on] ?? [])
          .map(m => [m, TARGET.get(m)])
          .filter(([, t]) => t)
      );
    // What the members have between them: their props, each prop's values,
    // their states. A typo or another case on the group is read as on one
    // part, against all of them.
    const props = [...new Set(members.flatMap(([, t]) => t.props))];
    /** @type {Record<string, string[]>} */
    const variants = {};
    for (const [m] of members)
      for (const [k, vals] of Object.entries(C.variantValues(m)))
        variants[k] = [...new Set([...(variants[k] ?? []), ...vals])];
    const states = [...new Set(members.flatMap(([m]) => partStates(ctx, m)))];
    if (s.when) {
      // (Several conditions: a member that has every one.)
      const fits = members.some(([m, t]) =>
        String(s.when)
          .split('+')
          .every(w => {
            const [p, wv, ...more] = w.split(':');
            if (
              !wv ||
              more.length ||
              !(t.props.includes(p) || p in C.variantValues(m))
            )
              return false;
            const vals = C.variantValues(m)[p] ?? [];
            return !vals.length || vals.includes(wv);
          }),
      );
      if (!fits) {
        const reading = whenReading(s.when, props, variants);
        const when = reading.written ?? reading.meant;
        refuse(
          E.ERR_THEME_UNKNOWN_VARIANT,
          `No member of the ${s.on} group has ${s.when}.`,
          {
            ...(when ? {didYouMean: [when]} : {}),
            run: [
              ...(when ? [setLine(slug, thing, v, {...s, when}, unset)] : []),
              `${HOW} ${s.on}`,
            ],
          },
        );
      }
    }
    if (s.state && !states.includes(s.state))
      s.state = sameState(s.state, states) ?? s.state;
    const state = s.state;
    if (
      state &&
      !members.some(([m]) => statesHold(partStates(ctx, m), state))
    ) {
      const denied = negatedState(state, states);
      if (denied)
        refuse(
          E.ERR_THEME_UNKNOWN_STATE,
          `"${s.state}" is not a state of the ${s.on} group: it names its members when they are not ${denied}, their rest look, which a setting with no --state gives.`,
          {run: [setLine(slug, thing, v, {...s, state: undefined}, unset)]},
        );
      const meant = stateMeant(state, states);
      refuse(
        E.ERR_THEME_UNKNOWN_STATE,
        `"${s.state}" is not a state of any member of the ${s.on} group.`,
        {
          ...(meant ? {didYouMean: [meant]} : {}),
          run: [
            ...(meant
              ? [setLine(slug, thing, v, {...s, state: meant}, unset)]
              : []),
            `${HOW} ${s.on}`,
          ],
        },
      );
    }
  }
  // A comparative is a step from the value now (never a rung picked by
  // spelling, which can go the other way).
  if (!unset && (thing === 'corners' || thing === 'spacing')) {
    const w = v.toLowerCase();
    const MORE =
      thing === 'corners'
        ? /^(rounder|softer|bigger|larger|curvier|more rounded)$/
        : /^(roomier|looser|bigger|larger|wider|airier|more spacious)$/;
    const LESS =
      thing === 'corners'
        ? /^(sharper|squarer|smaller|tighter|harder|less rounded)$/
        : /^(tighter|denser|smaller|narrower|more compact|closer)$/;
    if (MORE.test(w))
      return checkOne(ctx, slug, data, thing, 'more', flags, unset);
    if (LESS.test(w))
      return checkOne(ctx, slug, data, thing, 'less', flags, unset);
  }
  const step = v === 'more' || v === 'less';
  // more/less step a dial with a scale; on a dial of named looks, they name
  // nothing, so the answer is what the dial takes, not one of its values.
  if (
    step &&
    !unset &&
    DIALS[thing] &&
    !['corners', 'spacing', 'text-size', 'vibrancy'].includes(thing)
  )
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${v}" steps a dial with a scale (corners, spacing, text-size, vibrancy); ${thing} takes one of ${DIALS[thing].values.replace(/\|/g, ', ')}.`,
      {run: [`${HOW} ${thing}`]},
    );
  if (DIALS[thing]) {
    s.source = 'dial';
    if (['surfaces', 'buttons', 'type'].includes(thing)) {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${thing} moves every part it covers; drop --on. For one part, set CSS properties --on <part>.`,
          {
            run: [
              `${P} set ${slug} ${thing} ${quoteCommandArgument(v || DIALS[thing].values.split('|')[0])}`,
            ],
          },
        );
      if (s.mode)
        refuse(
          E.ERR_THEME_NO_MODE,
          `${thing} is the same in light and dark; drop --mode.`,
          {run: [`${P} set ${slug} ${thing} ${quoteCommandArgument(v)}`]},
        );
      if (unset) return s;
      const ok = DIALS[thing].values.split('|');
      const lower = v.toLowerCase();
      if (!ok.includes(v)) {
        // A word that means one of the values names it; a word close in
        // spelling only, the nearest; anything else, no guess (never the
        // first value, which may be the opposite).
        const meant = DIAL_WORDS[thing]?.[lower];
        const near = ok.includes(lower)
          ? [lower]
          : meant
            ? [meant]
            : closestOf(lower, ok);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${thing} takes ${DIALS[thing].values}, not "${v}".`,
          {
            didYouMean: near,
            run:
              // `type` is the scale's shape; a text-size word or a length
              // is the body size: text-size, never the corners.
              thing === 'type' &&
              (['small', 'medium', 'large', 'larger'].includes(lower) ||
                (/[a-z%]$/.test(lower) && textSizePx(lower) != null))
                ? [
                    `${P} set ${slug} text-size ${['small', 'medium', 'large', 'larger'].includes(lower) ? lower : textSizePx(lower)}`,
                  ]
                : near[0]
                  ? // Each reading of a typo equally near two values.
                    near.map(x => `${P} set ${slug} ${thing} ${x}`)
                  : // A type-scale ratio (1.25) is the nearest type preset.
                    thing === 'type' && ratioPreset(lower)
                    ? [`${P} set ${slug} type ${ratioPreset(lower)}`]
                    : // A corner word or a size with a unit is the corners dial:
                      // on the buttons for `buttons`, for the whole theme
                      // otherwise. A bare number is no size: the dial's own
                      // words.
                      CORNERS.some(([n]) => lower.replace(/s$/, '') === n) ||
                        (/[a-z%]$/.test(lower) && lengthPx(lower) != null)
                      ? [
                          setLine(
                            slug,
                            'corners',
                            CORNERS.find(
                              ([n]) => lower.replace(/s$/, '') === n,
                            )?.[0] ?? lower,
                            thing === 'buttons' ? {on: 'button'} : {},
                          ),
                        ]
                      : [
                          ...(/^[+-]?\d*\.?\d+$/.test(lower) ? ok : [])
                            .filter(w => /^[a-z-]+$/.test(w))
                            .slice(0, 4)
                            .map(w => `${P} set ${slug} ${thing} ${w}`),
                          `${HOW} ${thing}`,
                        ],
          },
        );
      }
      return s;
    }
    if (thing === 'headings') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'headings applies to every heading; drop --on. For one heading level use font-weight or letter-spacing --on heading --when level:<1-6>.',
          {
            // The dial without --on, then the asked weight or tracking on
            // one level; a word with no meaning here gets neither.
            run: (() => {
              const w = String(v ?? '')
                .trim()
                .toLowerCase();
              if (HEADING_WEIGHTS[w] !== undefined)
                return [
                  `${P} set ${slug} headings ${w}`,
                  `${P} set ${slug} font-weight ${HEADING_WEIGHTS[w]} --on heading --when level:1`,
                ];
              if (HEADING_TRACKING[w] !== undefined)
                return [
                  `${P} set ${slug} headings ${w}`,
                  `${P} set ${slug} letter-spacing ${quoteCommandArgument(HEADING_TRACKING[w])} --on heading --when level:1`,
                ];
              return [`${HOW} headings`];
            })(),
          },
        );
      // A comparative weight word is the weight (lighter is light, never the
      // tracking tighter); two words (`bold tight`, `bold, tight`) are a
      // weight and a tracking, one line each.
      if (!unset) {
        const MORE = /** @type {Record<string, string>} */ ({
          lighter: 'light',
          thinner: 'light',
          bolder: 'bold',
          heavier: 'heavy',
          wider: 'wide',
          looser: 'wide',
        });
        const known = (/** @type {string} */ w) =>
          HEADING_WEIGHTS[w] !== undefined || HEADING_TRACKING[w] !== undefined;
        const headingWords = [
          ...Object.keys(HEADING_WEIGHTS),
          ...Object.keys(HEADING_TRACKING),
        ];
        const typed = String(v ?? '')
          .trim()
          .toLowerCase()
          .split(/[\s,]+/)
          .filter(w => w && w !== 'and' && w !== '&')
          .map(w => MORE[w] ?? w);
        // In a pair, a word one typo from exactly one headings word (the
        // one typo limit) is that word, as it is alone.
        const words =
          typed.length > 1
            ? typed.map(w => {
                if (known(w)) return w;
                const hits = headingWords.filter(x => typoNear(w, x));
                return hits.length === 1 ? hits[0] : w;
              })
            : typed;
        if (
          (words.length > 1 || MORE[String(v).trim().toLowerCase()]) &&
          words.every(known)
        )
          refuse(
            E.ERR_THEME_BAD_VALUE,
            words.length > 1
              ? `"${v}" is ${words.length} headings values; headings takes one at a time (a weight and a tracking are two settings).`
              : `"${v}" is the weight ${words[0]}.`,
            // Both are wanted: the second line is the next step, not
            // another choice.
            {
              run: words.map((w, i) =>
                i === 0
                  ? `${P} set ${slug} headings ${w}`
                  : {
                      name: `${P} set ${slug} headings ${w}`,
                      reason: 'then this: headings takes one value at a time',
                    },
              ),
            },
          );
      }
      if (s.mode)
        refuse(
          E.ERR_THEME_NO_MODE,
          'headings is the same in light and dark; drop --mode.',
          {
            run: [
              `${P} ${unset ? 'undo' : 'set'} ${slug} headings${v ? ` ${quoteCommandArgument(v)}` : ''}`,
            ],
          },
        );
      if (unset) {
        // With no word, the one headings setting the theme has.
        const held = data.settings.filter(x => x.thing === 'headings');
        // The half word in any letters: `Tracking`, `TIGHT`.
        const w = String(v ?? '')
          .trim()
          .toLowerCase();
        s.axis =
          HEADING_TRACKING[w] !== undefined || w === 'tracking'
            ? 'tracking'
            : HEADING_WEIGHTS[w] !== undefined || w === 'weight'
              ? 'weight'
              : held.length === 1
                ? (held[0].axis ?? 'weight')
                : 'weight';
        return s;
      }
      if (HEADING_WEIGHTS[v] !== undefined) s.axis = 'weight';
      else if (HEADING_TRACKING[v] !== undefined) s.axis = 'tracking';
      else {
        // The word meant: in other letters (BOLD), or the rung nearest a
        // weight number (800 is heavy); never a rung the other way.
        const lower = v.trim().toLowerCase();
        const words = [
          ...Object.keys(HEADING_WEIGHTS),
          ...Object.keys(HEADING_TRACKING),
        ];
        // A weight word (extra bold, ultra-bold) is its number, read as
        // the rung nearest it (800 is heavy).
        const weightWord = WEIGHT_WORDS[lower.replace(/[\s-]+/g, '')];
        const weight = /^\d+(\.\d+)?$/.test(lower)
          ? Number(lower)
          : weightWord
            ? Number(weightWord)
            : null;
        // A typo equally near two words (tightr: tight, tighter) has each
        // as a reading.
        const readings = words.includes(lower)
          ? [lower]
          : weight != null
            ? [weightRung(weight)].filter(Boolean)
            : closestOf(lower, words);
        const meant = readings[0];
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `headings takes ${DIALS.headings.values}, not "${v}".${weight != null && meant ? ` ${meant} sets weight ${HEADING_WEIGHTS[meant]}.` : ''}${readings.length > 1 ? ` "${v}" is as near ${readings.join(' as ')}.` : ''}`,
          {
            didYouMean: readings,
            run: readings.length
              ? readings.map(x => setLine(slug, 'headings', x, s))
              : [`${HOW} headings`],
          },
        );
      }
      return s;
    }
    if (unset) return s;
    /**
     * @param {Array<[string, number]>} L
     * @param {string | number} def
     * @param {(rung: [string, number]) => string | null} [past] the exact
     *   line one step past a last rung, when one setting does it (a size the
     *   dial takes, or the token the part reads for it); none: no line
     */
    const ladder = (L, def, past) => {
      // The value in effect for the target: its own setting, else the
      // whole-theme one, else the starting point.
      // Same target: the part, and the same variant and state.
      const latest = (/** @type {string} */ on) =>
        [...data.settings].reverse().find(
          x =>
            x.thing === thing &&
            (x.on ?? '') === on &&
            (x.when ?? '') === (on ? (s.when ?? '') : '') &&
            (x.state ?? '') === (on ? (s.state ?? '') : '') &&
            // A member set alone (--only) is not the member as the group
            // spreads it.
            Boolean(x.only) === (on === s.on ? Boolean(s.only) : false),
        );
      const own = (/** @type {string} */ on) => latest(on)?.value;
      // A member covered by a later group setting shows the group's value
      // (the later one wins, as the build applies them).
      const fam = s.on ? familyOf(s.on) : null;
      // For a variant or state with no setting of its own, the part's
      // plain setting applies there too.
      const plainOn = (/** @type {string} */ on) =>
        [...data.settings]
          .reverse()
          .find(
            x =>
              x.thing === thing &&
              (x.on ?? '') === on &&
              !x.when &&
              !x.state &&
              !x.only === !(on === s.on && s.only),
          );
      const mine =
        latest(s.on ?? '') ??
        (s.on && (s.when || s.state) ? plainOn(s.on) : undefined);
      // With --only too: the member shows its group's value until it has one
      // of its own, as corners step.
      const group =
        fam && fam !== s.on
          ? (latest(fam) ?? (s.when || s.state ? plainOn(fam) : undefined))
          : undefined;
      const shown =
        mine && group
          ? data.settings.indexOf(group) > data.settings.indexOf(mine)
            ? group
            : mine
          : (mine ?? group);
      // A value the step reads: a rung or a size. A saved value it cannot
      // read (a step word saved by hand) steps from what applies without
      // it, never from the first rung.
      const readable = (/** @type {unknown} */ x) =>
        x != null &&
        (typeof x === 'number' ||
          L.some(([n]) => n === x) ||
          lengthPx(String(x)) != null ||
          /^\d*\.?\d+$/.test(String(x)));
      const cur =
        [
          shown?.value,
          // A part's own radius (a number) already counts a whole-theme
          // setting.
          s.on && typeof def !== 'number' ? own('') : undefined,
          def,
        ].find(readable) ?? def;
      const at = L.findIndex(([n]) => n === cur);
      const stepped = at + (v === 'more' ? 1 : -1);
      if (at >= 0 && stepped >= 0 && stepped < L.length) return L[stepped][0];
      // At the last rung that way, a step goes nowhere: refused as every
      // dial refuses it at its end, with the other way.
      if (at >= 0) {
        // Past the last rung, an exact size still does it, when one setting
        // does: the dial's own line for it.
        const beyond = past ? past(L[at]) : null;
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${thing} is already at its ${v === 'more' ? 'largest' : 'smallest'} step, ${L[at][0]}${s.on ? ` on ${s.on}` : ''}, so "${v}" has nowhere to go.${beyond ? ` An exact size goes past the rungs.` : ''}`,
          {
            run: [
              setLine(slug, thing, v === 'more' ? 'less' : 'more', s),
              ...(beyond ? [beyond] : []),
            ],
          },
        );
      }
      // A size between rungs steps to the next rung that way, never past it.
      const px =
        typeof cur === 'number'
          ? cur
          : (lengthPx(cur) ??
            (/^\d*\.?\d+$/.test(String(cur)) ? Number(cur) : Number.NaN));
      if (Number.isNaN(px)) return L[0][0];
      const next =
        v === 'more'
          ? L.find(([, n]) => n > px + 0.01)
          : [...L].reverse().find(([, n]) => n < px - 0.01);
      // Past the last step that way, a step would go back: give a size.
      if (!next) {
        const edge = /** @type {[string, number]} */ (
          v === 'more' ? L[L.length - 1] : L[0]
        );
        // The example stays inside what the dial takes (text-size: 10 to
        // 32); at that end, the exact token takes the size instead.
        const [lo, hi] = thing === 'text-size' ? [10, 32] : [0, Infinity];
        const want = Math.round(px + (v === 'more' ? 2 : -2));
        const atEnd = v === 'more' ? px >= hi : px <= lo;
        const example = String(cur).replace(
          /\d*\.?\d+/,
          String(Math.max(lo, Math.min(hi, want))),
        );
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${thing} is ${typeof cur === 'number' ? `${cur}px` : cur}, already ${Math.abs(px - edge[1]) < 0.01 ? 'at' : v === 'more' ? 'above' : 'below'} its ${v === 'more' ? 'largest' : 'smallest'} step (${edge[0]}, ${edge[1]}px), so "${v}" has nowhere to go.${atEnd ? ` It is also the ${v === 'more' ? 'largest' : 'smallest'} size ${thing} takes (${lo} to ${hi}); the base font size token takes any size.` : ' Give an exact size.'}`,
          {
            run: atEnd
              ? [
                  `${P} set ${slug} --font-size-base ${quoteCommandArgument(`${Math.max(1, want)}px`)}`,
                ]
              : [
                  `${P} set ${slug} ${thing} ${quoteCommandArgument(example)}${s.on ? ` --on ${s.on}` : ''}`,
                ],
          },
        );
      }
      return next[0];
    };
    if (PALETTE_DIALS.includes(thing) && (s.on || s.mode)) {
      const token = paletteToken(thing);
      const value = quoteCommandArgument(v || '#7c3aed');
      /** @type {string[]} */
      let run = [
        `${P} set ${slug} ${token} ${value}${onFlag}${s.mode ? ` --mode ${s.mode}` : ''}`,
      ];
      // The token is suggested only where the part reads it; otherwise the
      // part's own route, as a token set on the part would be refused.
      if (s.on && !ctx.unchecked) {
        /** @param {string} t */
        const works = t => {
          try {
            checkSetting(ctx, slug, data, t, v || '#7c3aed', {
              on: s.on,
              when: s.when,
              state: s.state,
            });
            return true;
          } catch {
            return false;
          }
        };
        const direct = `${P} set ${slug} background-color ${value}${onFlag}`;
        // The neutral color is a surface: on a part, that is its background.
        if (thing === 'neutral') run = [direct, ...run];
        else if (!works(token) && works('background-color')) run = [direct];
      }
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${thing} generates the colors of the whole theme, light and dark from one color; drop ${s.on ? '--on' : '--mode'}. For an exact color on one part or in one mode, set ${thing === 'neutral' && s.on ? "the part's background, or " : ''}the token itself.`,
        {run},
      );
    }
    if (s.mode)
      refuse(
        E.ERR_THEME_NO_MODE,
        `${thing} is not a color, so it is the same in light and dark; drop --mode.`,
        // The same scope, every other flag kept.
        {run: [setLine(slug, thing, v, {...s, mode: undefined})]},
      );
    if (thing === 'corners') {
      if (s.on) {
        refuseInvisibleCorners(ctx, slug, s, data);
        refuseRadioCorners(ctx, slug, s, data);
      }
      // With no corners setting yet, a step starts from the base theme's
      // own radius.
      if (step) {
        // A step moves to the next rung the part SHOWS bigger or smaller:
        // each rung is measured as the build writes it for the radius token
        // the part reads (a card reads the container radius), and so is
        // what the part shows now.
        const base = ctx.base ?? {
          light: /** @type {Record<string, string>} */ ({}),
          dark: /** @type {Record<string, string>} */ ({}),
        };
        const token = s.on
          ? radiusTokenOf(ctx, partsOf(ctx, s)[0] ?? s.on, s.when)
          : '--radius-element';
        // What the part shows: a setting on it or on its group (the later
        // one wins), else a whole-theme setting, else the base theme.
        const fam = s.on ? familyOf(s.on) : null;
        // A setting reaches the part when it is on the part itself, on its
        // group, or spread from a member (pill on text-input reaches the
        // whole inputs group). One for the same variant and state wins,
        // else the part's plain one (it applies there too).
        const part = partsOf(ctx, s)[0] ?? s.on;
        const reaches = (/** @type {import('./_settings.mjs').Setting} */ x) =>
          x.thing === 'corners' &&
          x.on &&
          (x.on === s.on ||
            (fam && fam !== s.on && x.on === fam && !x.only) ||
            (!x.only && partsOf(ctx, x).includes(part)));
        const onPart = s.on
          ? ([...data.settings]
              .reverse()
              .find(
                x =>
                  reaches(x) &&
                  (x.when ?? '') === (s.when ?? '') &&
                  (x.state ?? '') === (s.state ?? ''),
              ) ??
            (s.when || s.state
              ? [...data.settings]
                  .reverse()
                  .find(x => reaches(x) && !x.when && !x.state)
              : undefined))
          : undefined;
        // A step on a member set alone stays on that member alone.
        if (onPart && onPart.on === s.on && onPart.only && !s.only)
          s.only = true;
        // A saved value the step cannot read (a step word saved by hand)
        // is passed over: the step goes from what applies without it.
        const whole = [...data.settings]
          .reverse()
          .find(
            x =>
              x.thing === 'corners' &&
              !x.on &&
              !Number.isNaN(cornerPxOf(String(x.value))),
          );
        const isRung = (/** @type {string} */ x) =>
          CORNERS.some(([n]) => n === x);
        // An exact border-radius on the part wins over any corners dial:
        // that is what it shows, and a step starts from it.
        const exactRadius = s.on
          ? [...data.settings]
              .reverse()
              .find(
                x =>
                  x.source === 'property' &&
                  x.thing === 'border-radius' &&
                  x.on &&
                  partsOf(ctx, x).includes(part) &&
                  (x.when ?? '') === (s.when ?? '') &&
                  (x.state ?? '') === (s.state ?? ''),
              )
          : undefined;
        const exactPx = exactRadius ? lengthPx(exactRadius.value) : null;
        const shown =
          exactPx != null
            ? exactPx
            : onPart && !Number.isNaN(cornerPxOf(String(onPart.value)))
              ? isRung(onPart.value) || cornerPxOf(onPart.value) >= 1000
                ? radiusAt(base, onPart.value, token)
                : cornerPxOf(onPart.value)
              : whole
                ? radiusAt(base, whole.value, token)
                : // The base theme's own radius on the part, when its rule
                  // gives one; else the radius token's; one it does not give
                  // in px (a var() chain) counts as medium's.
                  (basePartRadiusPx(ctx, base, part, s.when) ??
                  tokenPx(base, token) ??
                  radiusAt(base, 'medium', token));
        // The step between round and pill, so one step more from round is
        // not a pill.
        const ladder = CORNERS.flatMap(([n]) =>
          n === 'pill' ? [ROUND_TO_PILL_STEP, n] : [n],
        );
        // A size on a part is that radius as written (as the part's own
        // setting reads); a rung, or a size for the whole theme, is the
        // radius it gives the part's token.
        const rungs = ladder.map(
          n =>
            /** @type {const} */ ([
              n,
              s.on && !isRung(n) ? cornerPxOf(n) : radiusAt(base, n, token),
            ]),
        );
        const next =
          v === 'more'
            ? rungs.find(([, n]) => n > shown + 0.01)
            : [...rungs].reverse().find(([, n]) => n < shown - 0.01);
        // No rung that way: nothing is written, as for spacing.
        if (!next && !Number.isNaN(shown))
          refuse(
            E.ERR_THEME_NO_EFFECT,
            `corners is already at the ${v === 'more' ? 'roundest' : 'squarest'} rung ${s.on ? `on ${s.on}` : 'for the theme'}, so ${v} has nowhere to go.`,
            {
              run: [
                setLine(slug, 'corners', v === 'more' ? 'less' : 'more', s),
              ],
            },
          );
        s.value = next ? next[0] : 'medium';
      } else {
        // A value with copy debris (`8px;`): the value without it.
        if (withoutCopyDebris(v) !== v && withoutCopyDebris(v))
          refuse(
            E.ERR_THEME_BAD_VALUE,
            `"${v}" holds copy debris (a ;, a comment or !important); corners takes the value alone.`,
            {run: [setLine(slug, 'corners', withoutCopyDebris(v), s)]},
          );
        // A rung in any case, a size in px written any way: the plain form.
        const lower = v.toLowerCase();
        // Any CSS number in px (2e1px, +4px), the shared length parse; a
        // rem is that many 16px, saved in px (the one reading, cornersPlain,
        // which the settings reader gives a saved value too).
        const plain = cornersPlain(v);
        if (plain) {
          s.value = plain;
          if (/rem$/.test(lower))
            s.note = `corners ${v.trim()} is saved as ${s.value}`;
        }
        // No rounding, said any way, is square.
        else if (NO_ROUNDING.includes(lower)) s.value = 'square';
        else {
          // What it most likely means, as a value corners takes: a simple
          // calc() of px is worked out.
          const calc =
            /^calc\(\s*(\d*\.?\d+)px\s*([*/+-])\s*(\d*\.?\d+)(px)?\s*\)$/.exec(
              lower,
            );
          const calcPx = calc
            ? {
                '*': Number(calc[1]) * Number(calc[3]),
                '/': Number(calc[1]) / Number(calc[3]),
                '+': Number(calc[1]) + Number(calc[3]),
                '-': Number(calc[1]) - Number(calc[3]),
              }[/** @type {'*' | '/' | '+' | '-'} */ (calc[2])]
            : null;
          // A bare number (0.5, as a pasted --radius: 0.5rem loses its
          // unit) has no unit to read it by: no size is guessed.
          const bareNumber = /^[+-]?\d*\.?\d+$/.test(lower);
          // A comma between digits as the one comma rule reads it
          // (0,5rem is 0.5rem).
          const len =
            calcPx != null && Number.isFinite(calcPx)
              ? calcPx
              : bareNumber
                ? null
                : lengthPx(commaNumbers(lower));
          const pct = /^(\d+(?:\.\d+)?)%$/.exec(lower);
          // Tailwind's names, and rounding said with a negation: what they
          // mean (rounded-none and not round are square, rounded-full is
          // pill, rounded-[12px] is 12px).
          const tw = /^rounded-\[(.+)\]$/.exec(lower)?.[1];
          // A rung said as an English word made from it (`rounded` is
          // round, `squared` square) is that rung, ahead of Tailwind's
          // class of the same letters (its `rounded` is 4px, which on most
          // bases is sharper than asked).
          const rung = CORNERS.map(([n]) => n).find(
            n => lower === `${n}ed` || lower === `${n}d`,
          );
          // Tailwind's own size for those letters is offered after it.
          const tailwindToo =
            rung && TAILWIND_RADIUS[lower] && TAILWIND_RADIUS[lower] !== rung
              ? TAILWIND_RADIUS[lower]
              : null;
          const opposite =
            rung ??
            TAILWIND_RADIUS[lower] ??
            (tw && lengthPx(tw) != null
              ? `${Math.round(Number(lengthPx(tw)) * 100) / 100}px`
              : negates(lower) && /round/.test(lower)
                ? 'square'
                : null);
          // A radius below zero means none: square.
          const meant =
            opposite ??
            (len != null
              ? len <= 0
                ? 'square'
                : `${Math.round(len * 100) / 100}px`
              : pct
                ? Number(pct[1]) >= 50
                  ? 'pill'
                  : null
                : bareNumber
                  ? null
                  : (nearest(
                      lower,
                      CORNERS.map(([n]) => n),
                    )[0] ?? null));
          refuse(
            E.ERR_THEME_BAD_VALUE,
            `corners takes ${DIALS.corners.values}, not "${v}"${bareNumber ? ' (a number needs its unit: px or rem)' : ''}${tailwindToo ? ` ("${v}" reads as ${rung}; Tailwind's ${lower} class is ${tailwindToo})` : ''}.`,
            {
              ...(meant ? {didYouMean: [meant]} : {}),
              // The same scope, flags included.
              // Nothing near: how corners, never a stock rung.
              // A whole bare number gets the line with px, the unit it
              // most likely meant, and how corners; one below one (a
              // pasted 0.5rem that lost its unit) has no unit to read it
              // by: how corners only.
              run:
                bareNumber && Number(lower) >= 1
                  ? [
                      setLine(slug, 'corners', `${Number(lower)}px`, s),
                      `${HOW} corners`,
                    ]
                  : [
                      meant
                        ? setLine(slug, 'corners', meant, s)
                        : `${HOW} corners`,
                      ...(tailwindToo
                        ? [setLine(slug, 'corners', tailwindToo, s)]
                        : []),
                    ],
            },
          );
        }
      }
    } else if (thing === 'spacing') {
      // Spacing scales the space tokens a part reads; a state does not
      // change them, and a part that reads none shows nothing.
      if (s.state)
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `spacing does not change in a state; drop --state.`,
          {
            run: [
              setLine(slug, 'spacing', v || 'roomy', {
                ...s,
                state: undefined,
                mode: undefined,
              }),
            ],
          },
        );
      if (s.on && !ctx.unchecked) {
        // The tokens reach the parts inside it too.
        const reads = (/** @type {string} */ t) =>
          Object.values(ctx.C.MAP[t]?.own ?? {}).some(p =>
            Object.keys(p.tokens ?? {}).some(x =>
              /^--(spacing-|size-element-)/.test(x),
            ),
          );
        const spaced = partsOf(ctx, s).filter(
          t => reads(t) || (ctx.C.MAP[t]?.contains ?? []).some(reads),
        );
        if (!spaced.length)
          refuse(
            E.ERR_THEME_NO_EFFECT,
            `${s.on} reads no spacing or control size, so spacing changes nothing you see there. For space around it, set margin or padding on it.`,
            {run: [`${P} set ${slug} padding 8px${onFlag}`]},
          );
      }
      // A scale typed as a number (x0.75, 0.75, 75%) names the rung nearest
      // that factor.
      const factor = /^x?(\d*\.?\d+)(%)?$/i.exec(commaNumbers(v));
      const nearFactor = factor
        ? SPACING.reduce((a, b) =>
            Math.abs(b[1] - Number(factor[1]) / (factor[2] ? 100 : 1)) <
            Math.abs(a[1] - Number(factor[1]) / (factor[2] ? 100 : 1))
              ? b
              : a,
          )[0]
        : null;
      // Past its last rung, spacing on a part goes on in the control height
      // the part reads (a bigger button is a taller one): that token, one
      // step past the rung's scale, on the part. The whole theme has no one
      // setting for it.
      const pastSpacing = (/** @type {[string, number]} */ [, k]) => {
        if (!s.on) return null;
        // (A group: its first member that reads a control height.)
        const parts = groupsOf(ctx)[s.on] ?? [s.on];
        const token = parts
          .flatMap(p => C.partReads(p, 'size') ?? [])
          .map((/** @type {{token: string}} */ r) => r.token)
          .find((/** @type {string} */ t) => /^--size-element-/.test(t));
        const px = token ? lengthPx(String(TOKENS[token] ?? '')) : null;
        if (!token || px == null) return null;
        const n = Math.round(px * k * (v === 'more' ? 1.15 : 0.87));
        return setLine(slug, token, `${n}px`, s);
      };
      if (step) s.value = ladder(SPACING, 'medium', pastSpacing);
      else if (!SPACING.some(([n]) => n === v) && nearFactor)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `spacing takes ${DIALS.spacing.values}, not "${v}"; the rung nearest that scale is ${nearFactor} (x${SPACING.find(([n]) => n === nearFactor)?.[1]}).`,
          {
            didYouMean: [nearFactor],
            run: [setLine(slug, 'spacing', nearFactor, s)],
          },
        );
      else if (NO_SPACE.includes(v.toLowerCase()))
        // Spacing scales the theme's space; it never goes to nothing. The
        // tightest rung is the nearest that works.
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `spacing scales the theme's space and never removes it; the tightest it goes is ${SPACING[0][0]}. For no space on one part, set padding or gap 0 on it.`,
          {
            didYouMean: [SPACING[0][0]],
            run: [setLine(slug, 'spacing', SPACING[0][0], s)],
          },
        );
      else if (!SPACING.some(([n]) => n === v))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `spacing takes ${DIALS.spacing.values}, not "${v}".`,
          {
            didYouMean: nearest(
              v,
              SPACING.map(([n]) => n),
            ),
            run: [
              (() => {
                const near = nearest(
                  v,
                  SPACING.map(([n]) => n),
                )[0];
                return near
                  ? setLine(slug, 'spacing', near, s)
                  : `${HOW} spacing`;
              })(),
            ],
          },
        );
    } else if (thing === 'text-size') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'text-size applies to the whole theme; for one part use font-size.',
          {
            // The asked size on the part: a rung's px (large is 15px), a
            // number as px; a step (more, less) has no size to carry.
            run: (() => {
              const w = String(v ?? '')
                .trim()
                .toLowerCase();
              const rung = TEXT_SIZE.find(([n]) => n === w)?.[1];
              const px =
                rung ?? (/^\d+(\.\d+)?(px)?$/.test(w) ? parseFloat(w) : null);
              return px != null && px > 0
                ? [setLine(slug, 'font-size', `${px}px`, s)]
                : [`${HOW} font-size`];
            })(),
          },
        );
      // With no text-size setting yet, a step starts from the size the base
      // theme's body text shows (past the last rung, it asks for a size).
      if (step)
        s.value = ladder(
          TEXT_SIZE,
          ctx.base ? baseTextPx(ctx.base) : 'medium',
          // A size the dial takes: one step past the rung's.
          ([, px]) =>
            setLine(
              slug,
              thing,
              String(Math.round(px * (v === 'more' ? 1.15 : 0.87))),
              s,
            ),
        );
      else if (
        /^\d+\.\d+$/.test(v.trim()) &&
        Number(v) >= 10 &&
        Number(v) <= 32 &&
        Math.round(Number(v)) !== Number(v)
      ) {
        // Core builds the type scale in whole pixels: the size is saved as
        // the whole pixel it builds, and the result says so.
        s.value = String(Math.round(Number(v)));
        s.note = `text-size ${v.trim()} is saved as ${s.value}: the type scale is built in whole pixels`;
      } else if (
        !TEXT_SIZE.some(([n]) => n === v) &&
        !(/^\d+(\.\d+)?$/.test(v.trim()) && Number(v) >= 10 && Number(v) <= 32)
      )
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `text-size takes ${DIALS['text-size'].values} (a number is the body size in pixels, 10 to 32), not "${String(value ?? v).trim()}".`,
          (() => {
            // A rung in other letter case (Medium) or with px is that rung;
            // a CSS size keyword (x-large) is the size CSS gives it.
            const keyword = CSS_SIZE_KEYWORDS[v.trim().toLowerCase()];
            if (keyword != null && keyword >= 10 && keyword <= 32)
              return {run: [`${P} set ${slug} text-size ${keyword}`]};
            const exact = TEXT_SIZE.find(
              ([n]) => n === v.trim().toLowerCase(),
            )?.[0];
            // A typo equally near two rungs (largr) has each as a reading.
            const near = exact
              ? [exact]
              : closestOf(
                  v.trim().toLowerCase(),
                  TEXT_SIZE.map(([n]) => n),
                );
            return near.length
              ? {
                  didYouMean: near,
                  run: near.map(x => `${P} set ${slug} text-size ${x}`),
                }
              : (() => {
                  // A size typed full-width or with a trailing dot
                  // (１８, 18.) is that size; one read any other way (a
                  // unit, a constant calc()) is that size. Nothing read:
                  // how text-size, never a stock size.
                  const t = typedPlain(v).replace(/\.$/, '');
                  const size =
                    /^\d+(\.\d+)?$/.test(t) &&
                    Number(t) >= 10 &&
                    Number(t) <= 32
                      ? String(Number(t))
                      : // As typed, its unit kept (3px is the smallest size,
                        // never a bare 3).
                        textSizePx(String(value ?? v));
                  return {
                    run: [
                      size != null
                        ? `${P} set ${slug} text-size ${size}`
                        : `${HOW} text-size`,
                    ],
                  };
                })();
          })(),
        );
      else if (!TEXT_SIZE.some(([n]) => n === v))
        s.value = String(Number(v.trim()));
    } else if (PALETTE_DIALS.includes(thing)) {
      if (step)
        refuse(E.ERR_THEME_BAD_VALUE, `${thing} takes a color, not a step.`, {
          run: [`${P} set ${slug} ${thing} ${quoteCommandArgument('#7c3aed')}`],
        });
      const problem = colorProblem(v);
      if (problem) {
        // What the value most likely meant: without quotes, a trailing `;`
        // or `!important`, a bare hex with its #, the opaque color, or the
        // nearest color name.
        const cleaned = (pastedDeclaration(v)?.value || typedPlain(v))
          .replace(/^var\(\s*--[a-z0-9-]+\s*,\s*(.+)\)$/i, '$1')
          .replace(/^(["'])(.*)\1$/, '$2')
          .replace(/\s*!important\s*$/i, '')
          .replace(/;+\s*$/, '')
          .trim()
          // A hex written 0x… (as in code) is that hex.
          .replace(/^0x([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i, '#$1')
          .replace(/^([0-9a-f]{3}|[0-9a-f]{6})$/i, '#$1');
        // A hex a digit short or over is refused as it is: the digit
        // missing could be anywhere, so none is made up.
        // A name of several words with a color among them (`navy blue`)
        // is that color.
        // Two names run together (`navyblue`) are the first, as the
        // spaced form is.
        const words = v
          .toLowerCase()
          .split(/[\s,-]+/)
          .filter(Boolean);
        // The words joined (dark red, light-blue, dark-slate-gray) are the
        // color they name. A word with a scale step (red-500, gray-900) is
        // no CSS color, and the bare word is another color: none is named.
        const joined = words.join('');
        const scaled = words.some(w => /\d/.test(w)) || /^[{]/.test(v.trim());
        const named =
          negates(v) || scaled
            ? []
            : words.length > 1 && COLOR_NAMES.includes(joined)
              ? [joined]
              : v
                  .toLowerCase()
                  .split(/[\s,-]+/)
                  .flatMap(w =>
                    COLOR_NAMES.includes(w)
                      ? [w]
                      : COLOR_NAMES.filter(
                          n =>
                            n.length >= 3 &&
                            w.startsWith(n) &&
                            COLOR_NAMES.includes(w.slice(n.length)),
                        ).slice(0, 1),
                  );
        const near =
          problem.kind === 'unknown'
            ? /^#?[0-9a-f]{4,8}$/i.test(v.trim())
              ? []
              : named.length
                ? named.slice(0, 1)
                : scaled
                  ? []
                  : nearest(v.toLowerCase(), COLOR_NAMES)
            : [];
        // light-dark(a, b): the dial takes one color, from which it makes
        // both modes; the light one is offered.
        const lightHalf =
          /^light-dark\(\s*([^,]+?)\s*,/i.exec(cleaned)?.[1] ?? null;
        const better =
          problem.opaque ??
          (cleaned !== v && !colorProblem(cleaned)
            ? cleaned
            : lightHalf && !colorProblem(lightHalf)
              ? lightHalf
              : near[0]);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${v}" ${problem.message}.${problem.kind === 'unknown' || problem.kind === 'malformed' ? ' Give a hex, a color name, or an rgb(), hsl(), hwb(), lab(), lch(), oklab(), oklch() or color() color.' : ''}${better && better === lightHalf ? ` ${thing} takes one color and makes both modes from it; the light one (${better}) is offered. For a dark value of your own, set --color-accent --mode dark after.` : ''}`,
          {
            didYouMean: better ? [better] : near,
            run: [
              `${P} set ${slug} ${thing} ${quoteCommandArgument(better ?? '#7c3aed')}`,
            ],
          },
        );
      }
    } else if (thing === 'vibrancy') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'vibrancy applies to every generated color of the theme; drop --on.',
          {run: [`${P} set ${slug} vibrancy ${quoteCommandArgument(v)}`]},
        );
      if (step) {
        const saved = [...data.settings]
          .reverse()
          .find(x => x.thing === 'vibrancy')?.value;
        // A value edited by hand that is not one steps from the default.
        const cur =
          saved != null && /^\d{1,3}$/.test(saved) && Number(saved) <= 100
            ? Number(saved)
            : VIBRANCY_DEFAULT;
        const next = Math.max(
          0,
          Math.min(100, cur + (v === 'more' ? 10 : -10)),
        );
        if (next === cur)
          refuse(
            E.ERR_THEME_NO_EFFECT,
            `vibrancy is already ${cur}, the ${cur >= 100 ? 'most vivid' : 'grayest'}, so ${v} changes nothing.`,
            {
              run: [
                `${P} set ${slug} vibrancy ${v === 'more' ? 'less' : 'more'}`,
              ],
            },
          );
        s.value = String(next);
      }
      const colors = data.settings.filter(
        x => x.source === 'dial' && PALETTE_DIALS.includes(x.thing),
      );
      // With no color to saturate, no vibrancy value is suggested. A color
      // counts when vibrancy changes the shades made from it at all (a warm
      // gray has a little hue to take out or add; a pure gray has none).
      const canApply = colors.some(x =>
        vibrancyMoves(x.thing, seedOf(x.value), 0, 100),
      );
      if (!step && canApply && (!/^\d{1,3}$/.test(v) || Number(v) > 100)) {
        // The value meant: a step in other letters (MORE), or the number
        // read as CSS reads it (70%, 7e1), kept in range.
        // Quotes around it (`"50"`) are not part of it.
        const bare = v
          .trim()
          .replace(/^(["'])(.*)\1$/, '$2')
          .trim();
        const word = bare.toLowerCase();
        // A comma between digits as the one comma rule reads it (0,5).
        const n = cssNumber(commaNumbers(bare));
        // A fraction of one (0.5) is that share of the scale (50), as a
        // number with no unit from 0 to 1 is read.
        const scaled =
          n && n.unit === '' && n.value > 0 && n.value < 1
            ? n.value * 100
            : n?.value;
        const near = ['more', 'less'].includes(word)
          ? word
          : n && (n.unit === '' || n.unit === '%') && scaled != null
            ? String(Math.max(0, Math.min(100, Math.round(scaled))))
            : null;
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `vibrancy takes a whole number from 0 (gray) to 100 (most vivid), or more or less, not "${v}".`,
          {
            run: near
              ? [`${P} set ${slug} vibrancy ${near}`]
              : [`${HOW} vibrancy`],
          },
        );
      } else if (!step && /^\d{1,3}$/.test(v)) s.value = String(Number(v));
      // A gray has no color to saturate, so vibrancy changes nothing.
      if (!canApply)
        refuse(
          E.ERR_THEME_NO_EFFECT,
          colors.length
            ? `vibrancy sets how saturated the generated colors are, and every color this theme sets (${colors.map(x => `${x.thing} ${x.value}`).join(', ')}) comes out the same at every vibrancy: a gray with no hue to change, so it would change nothing. Set a color first.`
            : (() => {
                // Colors set as tokens or on parts are values of their own:
                // vibrancy saturates only what the color dials make.
                const own = data.settings.find(
                  (/** @type {any} */ x) =>
                    x &&
                    typeof x.value === 'string' &&
                    (/^--color-/.test(String(x.thing)) ||
                      /(^|-)colou?r$|^background(-color)?$|^fill$/.test(
                        String(x.thing),
                      )) &&
                    parseColor(x.value) != null,
                );
                return own
                  ? `vibrancy sets how saturated the colors made from the color dials (accent, neutral, …) are; this theme's colors are values of their own (${own.thing} ${own.value}), which vibrancy does not change. Set a color dial such as accent first.`
                  : 'vibrancy sets how saturated the generated colors are, and this theme sets no color yet. Set one first.';
              })(),
          {run: [`${HOW} accent`]},
        );
    } else if (thing === 'font') {
      if (s.when || s.state)
        refuse(
          E.ERR_INVALID_ARGUMENT,
          'font sets a role (body, heading, code) for the whole theme; it takes no --when or --state. For one part use font-family.',
          {
            run: [
              `${P} set ${slug} font-family ${quoteCommandArgument(v)} --on heading${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}`,
            ],
          },
        );
      if (s.on && !isRole) {
        // A CSS font shorthand goes to its longhands, each a command that
        // works; a value that is neither gets a family that works.
        // Every part of a font shorthand (or a lone keyword: bold) goes to
        // its own longhand; a family list is a family list.
        const parts = fontShorthandParts(v);
        const family = !parts && matchValue('font-family', v);
        const example = `${P} set ${slug} font-family ${quoteCommandArgument(exampleOf('font', 'font-family'))} --on ${s.on}`;
        const runs = parts
          ? parts.system || parts.repeat
            ? [example]
            : Object.entries(parts).map(
                ([k, x]) =>
                  `${P} set ${slug} ${k} ${quoteCommandArgument(x)} --on ${s.on}`,
              )
          : family
            ? [
                // A font dial word (mono, system, inter) names no family:
                // the part takes the stack it stands for.
                `${P} set ${slug} font-family ${quoteCommandArgument(fontStack(v) ?? v)} --on ${s.on}`,
              ]
            : [example];
        refuse(
          E.ERR_THEME_BAD_VALUE,
          parts?.repeat
            ? `font --on takes body, heading, or code, and "${v}" ${parts.part?.includes(',') ? `gives ${parts.repeat} more times than the parts that take it (${parts.part})` : `gives ${parts.part ?? 'one part of the font'} twice (${parts.repeat} is the second)`}, which no CSS font value does. For one part's font use font-family with a family, and set each other part of the font once.`
            : parts?.system
              ? `font --on takes body, heading, or code, and "${v}" is a system font keyword of the CSS font shorthand, which sets every part of the font at once. For one part's font use font-family with a family.`
              : `font --on takes body, heading, or code. For one part's font use font-family${parts ? ', and the other parts of the font shorthand one by one' : ''}.`,
          {run: runs},
        );
      }
      // A size, a weight or a whole CSS font value is no family: the font
      // dial and the roles take the family alone.
      // A variable is answered below, as the token form.
      const fontParts =
        step || /\b(var|env)\(/i.test(v) ? null : fontShorthandParts(v);
      if (
        fontParts &&
        (fontParts.repeat ||
          fontParts.system ||
          Object.keys(fontParts).some(k => k !== 'font-family'))
      ) {
        const fam = fontParts['font-family'];
        const on = s.on ? ` --on ${s.on}` : '';
        /** @type {string[]} */
        const runs = [
          `${P} set ${slug} font ${quoteCommandArgument(fam ?? 'inter')}${on}`,
        ];
        if (fontParts['font-size'] && (!s.on || s.on === 'body'))
          runs.push(
            `${P} set ${slug} --font-size-base ${quoteCommandArgument(fontParts['font-size'])}`,
          );
        const w = fontParts['font-weight'];
        if (w && (!s.on || s.on === 'heading')) {
          const num =
            w === 'bold' ? 700 : w === 'normal' ? 400 : Number(w) || null;
          const rung = num
            ? Object.entries(HEADING_WEIGHTS).reduce((a, b) =>
                Math.abs(Number(b[1]) - num) < Math.abs(Number(a[1]) - num)
                  ? b
                  : a,
              )[0]
            : null;
          if (rung) runs.push(`${P} set ${slug} headings ${rung}`);
        }
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `font${s.on ? ` --on ${s.on}` : ''} takes a family or a preset, and "${v}" ${fam ? 'is a whole CSS font value' : 'is no family'}: ${
            Object.keys(fontParts)
              .filter(k => !['font-family', 'repeat', 'system'].includes(k))
              .join(', ') || 'a keyword'
          } ${fam ? 'would be read as part of the family name' : 'would be read as a family name'}, and the text would fall back.`,
          {run: runs},
        );
      }
      if (step)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'font takes a preset or a family name, not a step.',
          {
            fix: `the values are ${DIALS.font.values}`,
            run: [`${P} set ${slug} font inter`, `${HOW} font`],
          },
        );
      // A family list: names, quoted or not, split by commas; nothing that
      // could end the CSS declaration or the preview's style block. A
      // preset typed in another case or spacing is the preset.
      s.value = v.trim();
      // A function (var(), env()) is no family name: the dial would quote
      // it as one. The role's token takes it as written.
      if (/[a-z-]+\(/i.test(s.value)) {
        const role = s.on && FONT_ROLES.includes(s.on) ? s.on : 'body';
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `font takes a preset or family names, not "${s.value}". To make ${s.on ? `the ${role} font` : 'a font'} read another token, set the token itself.`,
          {
            // The token's own rules decide: a value it refuses too is never
            // offered; a family name is.
            run: (() => {
              try {
                checkSetting(
                  ctx,
                  slug,
                  data,
                  `--font-family-${role}`,
                  s.value,
                  {},
                );
                return [
                  `${P} set ${slug} --font-family-${role} ${quoteCommandArgument(s.value)}`,
                ];
              } catch {
                return [`${P} set ${slug} font inter`, `${HOW} font`];
              }
            })(),
          },
        );
      }
      // A font package names its preset: @fontsource/inter is inter.
      const fromPackage = /^@fontsource(?:-variable)?\/([a-z0-9-]+)$/i.exec(
        s.value,
      )?.[1];
      if (fromPackage && OPEN_FONTS[fromPackage.toLowerCase()])
        s.value = fromPackage.toLowerCase();
      // A preset's package name (geist-sans for geist) is that preset.
      const byPackage = Object.keys(OPEN_FONTS).find(
        k =>
          OPEN_FONTS[k].pkg.split('/')[1] ===
          (fromPackage ?? s.value).toLowerCase(),
      );
      if (byPackage) s.value = byPackage;
      const key = s.value.toLowerCase().replace(/[\s_-]+/g, '');
      const preset = [...Object.keys(FONTS), ...Object.keys(OPEN_FONTS)].find(
        k => k.toLowerCase().replace(/[\s_-]+/g, '') === key,
      );
      if (preset) s.value = preset;
      // Each family is quoted whole, or a name that may hold an apostrophe
      // (O'Reilly Sans); the dial quotes it when it writes it.
      const family = (/** @type {string} */ f) =>
        /^"[^"]+"$/.test(f) || /^'[^']+'$/.test(f) || /^[^"',\s][^"]*$/.test(f);
      // A CSS-wide keyword inside a family list makes the browser drop
      // the whole declaration.
      const keyword = s.value
        .split(',')
        .map(f =>
          f
            .trim()
            .replace(/^["']|["']$/g, '')
            .toLowerCase(),
        )
        .find(f => CSS_WIDE_KEYWORDS.includes(f));
      if (keyword)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${keyword}" is a CSS keyword, not a font: inside a font list it makes the browser drop the whole font. Give a preset or a family name; to go back to the base theme's font, undo the font setting.`,
          {
            run: [
              `${P} set ${slug} font system${s.on ? ` --on ${s.on}` : ''}`,
              `${P} undo ${slug} font${s.on ? ` --on ${s.on}` : ''}`,
            ],
          },
        );
      const file = fontFileReason(s.value);
      if (file)
        refuse(E.ERR_THEME_BAD_VALUE, file, {
          run: [`${P} set ${slug} font inter${s.on ? ` --on ${s.on}` : ''}`],
        });
      if (s.value.split(',').some(f => f.trim().length > 100))
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'A font family name is at most 100 characters.',
          {run: [`${P} set ${slug} font inter`]},
        );
      // A CSS escape (`Gill\ Sans`, `\5FAE`) is part of a name, as any
      // CSS value reads it; a boundary is not.
      if (
        !s.value ||
        /[;{}<>\\\n]/.test(withoutCssEscapes(s.value)) ||
        !s.value.split(',').every(f => family(f.trim()))
      )
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${v}" is not a font: give a preset (${DIALS.font.values}) or a family list such as "Inter, sans-serif".`,
          {run: [`${P} set ${slug} font inter`]},
        );
    } else if (thing === 'base') {
      // A built-in base this project has not installed: install it, then
      // the same set.
      // A theme that builds on a base keeps it by changing nothing: no
      // base is offered only to a theme on none.
      if (LIKE.includes(v) && !unset && !baseInstalled(ctx.project, v))
        throw new AstryxError(
          `The ${v} theme is not installed, so ${slug} cannot build on it. Install @astryxdesign/theme-${v}, then set the base again${data.like ? `; ${slug} stays on ${data.like} until then` : ', or build on no theme'}. Nothing was changed.`,
          [
            ...onBuiltInSteps(ctx.project.cwd, v, `${P} set ${slug} base ${v}`),
            ...(data.like
              ? []
              : [
                  {
                    name: `${P} set ${slug} base none`,
                    reason: 'build on no theme',
                  },
                ]),
          ],
          E.ERR_UNKNOWN_THEME,
        );
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'base applies to the whole theme; drop --on.',
          {run: [`${P} set ${slug} base ${quoteCommandArgument(v)}`]},
        );
      if (![...LIKE, 'none'].includes(v)) {
        // `NEUTRAL`, `base=neutral`, `None`: the base meant.
        // Read from the value as typed: its letters' case marks an export
        // name (neutralTheme).
        const meant = baseWord(
          String(value ?? v)
            .trim()
            .replace(/^base\s*[=:]\s*/i, ''),
        );
        // The base meant: named in other letters, or a typo of a built-in
        // base under the one typo limit, installed or not (a theme made
        // here is never a base).
        const near =
          LIKE.includes(meant) || meant === 'none'
            ? meant
            : (nearest(meant, [...LIKE, 'none'])[0] ?? null);
        const madeHere = fs.existsSync(themeFiles(ctx.project.cwd, v).settings);
        const message = `base takes ${DIALS.base.values}, not "${v}".${madeHere ? ` ${v} is a theme made here, and a theme builds only on a built-in one.` : ''} Nothing was changed.`;
        // A built-in base that is not installed: install it, then the same
        // set (the one install helper).
        if (near && near !== 'none' && !baseInstalled(ctx.project, near))
          throw new AstryxError(
            message,
            [
              ...onBuiltInSteps(
                ctx.project.cwd,
                near,
                `${P} set ${slug} base ${near}`,
              ),
              {name: near, reason: 'did you mean'},
            ],
            E.ERR_THEME_BAD_VALUE,
          );
        refuse(
          E.ERR_THEME_BAD_VALUE,
          message.replace(/ Nothing was changed\.$/, ''),
          {
            didYouMean: near ? [near] : [],
            // With nothing near: what base takes, and the installed bases;
            // no base only for a theme on none, as keeping its base means
            // changing nothing.
            run: near
              ? [`${P} set ${slug} base ${near}`]
              : [
                  ...LIKE.filter(b => baseInstalled(ctx.project, b)).map(
                    b => `${P} set ${slug} base ${b}`,
                  ),
                  ...(data.like ? [] : [`${P} set ${slug} base none`]),
                  `${HOW} base`,
                ],
          },
        );
      }
    } else if (thing === 'mode') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'mode applies to the whole theme; drop --on.',
          {run: [`${P} set ${slug} mode ${quoteCommandArgument(v)}`]},
        );
      if (!['both', 'light-only', 'dark-only'].includes(v)) {
        const lower = v.toLowerCase().replace(/^mode\s*[=:]\s*/, '');
        const meant = modeDialValue(v);
        const near = meant
          ? [meant]
          : nearest(lower, ['both', 'light-only', 'dark-only']);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `mode takes both, light-only, or dark-only, not "${v}".`,
          {
            didYouMean: near,
            run: near[0]
              ? [`${P} set ${slug} mode ${near[0]}`]
              : ['both', 'light-only', 'dark-only'].map(
                  m => `${P} set ${slug} mode ${m}`,
                ),
          },
        );
      }
    }
    return s;
  }
  if (thing.startsWith('--')) {
    if (thing.startsWith('--_'))
      refuse(
        E.ERR_THEME_PRIVATE_TOKEN,
        `"${thing}" is private to a component; themes cannot set it.`,
        {run: [`${HOW} ${quoteCommandArgument(thing)}`]},
      );
    // A token typed with its declaration's colon (`--color-accent:`).
    const colonless = thing.replace(/\s*:+\s*$/, '');
    if (!(thing in TOKENS) && colonless !== thing && colonless in TOKENS)
      refuse(
        E.ERR_THEME_UNKNOWN_TOKEN,
        `"${thing}" ends with a colon; the token is ${colonless}.`,
        {
          run: [
            `${P} set ${slug} ${colonless}${v ? ` ${quoteCommandArgument(v.replace(/;+\s*$/, ''))}` : ''}`,
          ],
        },
      );
    // A dial typed as a flag (--corners round): the dial is meant.
    const dial = thing.replace(/^-+/, '');
    if (
      !(thing in TOKENS) &&
      (dial in DIALS || dial === 'base' || dial === 'mode')
    )
      refuse(
        E.ERR_THEME_UNKNOWN_TOKEN,
        `"${thing}" is not a design token; ${dial} is a dial, typed without dashes.`,
        {
          run: [setLine(slug, dial, v, {...s, mode: undefined}, unset)],
        },
      );
    if (!(thing in TOKENS)) {
      // The editor's own color words: danger is the error role, brand and
      // primary are the accent (as the danger and accent dials say).
      const role = thing
        .replace(/\bdanger\b/, 'error')
        .replace(/\b(brand|primary)\b/, 'accent');
      const aliased = role !== thing && role in TOKENS ? role : null;
      // The filtered list only when it lists something.
      const word = thing
        .replace(/^-+(color-)?/, '')
        .split('-')[0]
        .trim();
      const listed =
        word && Object.keys(TOKENS).some(k => k.includes(word))
          ? `${HOW} --list tokens ${word}`
          : `${HOW} --list tokens`;
      // The token written in another style (`--color_accent`,
      // `--colorAccent`, `--color accent`), as a dial or a property is read
      // in any style; else the one token a typo is near.
      const styled = `--${thing
        .replace(/^-+/, '')
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
        .replace(/[_\s]+/g, '-')
        .toLowerCase()}`;
      // A word of the name that is itself a word the editor knows (a part
      // or group, `link`) is no typo of another token's word (`pink`): the
      // name near by spelling is then no reading of it.
      const knownWord = (/** @type {string} */ w) =>
        TARGET.has(w) || Boolean(groupsOf(ctx)[w]) || partWords().has(w);
      const typedWords = thing.toLowerCase().replace(/^-+/, '').split('-');
      const near = nearest(thing, Object.keys(TOKENS)).filter(n => {
        const nearWords = n.replace(/^-+/, '').split('-');
        return !typedWords.some(
          (w, i) => w !== nearWords[i] && knownWord(w.replace(/s$/, '')),
        );
      });
      const meant =
        aliased ??
        (styled !== thing && styled in TOKENS
          ? styled
          : near.length === 1
            ? near[0]
            : null);
      refuse(
        E.ERR_THEME_UNKNOWN_TOKEN,
        `"${thing}" is not a design token.${aliased ? ` The token for that role is ${aliased}.` : meant === styled ? ` It reads as ${styled}.` : ''}`,
        {
          didYouMean: meant ? [meant] : near,
          run: [...(meant ? [setLine(slug, meant, v, s, unset)] : []), listed],
        },
      );
    }
    const type = C.typeOf(thing);
    // A shadow's colors can differ by mode inside the value: each layer's
    // color as light-dark(), the other mode's half kept from what that mode
    // shows now (the theme's own value, else the base theme's).
    if (s.mode && type === 'shadow' && !unset) {
      const other = s.mode === 'dark' ? 'light' : 'dark';
      const saved = [...(Array.isArray(data.settings) ? data.settings : [])]
        .reverse()
        .find(
          (/** @type {any} */ x) =>
            x?.thing === thing && !x.on && (!x.mode || x.mode === other),
        )?.value;
      const now = String(
        saved ?? ctx.base?.[other]?.[thing] ?? TOKENS[thing] ?? '',
      );
      /** The one color word of a layer, or null. @param {string} layer */
      const colorOf = layer =>
        splitTop(layer.trim(), ' ').find(
          w => /^light-dark\(/i.test(w) || isColorValue(w),
        ) ?? null;
      /** A light-dark() pair's half for a mode, or the color itself. @param {string} c @param {'light' | 'dark'} m */
      const halfOf = (c, m) => {
        const inner = /^light-dark\((.*)\)$/is.exec(c.trim())?.[1];
        const halves = inner == null ? [] : splitTop(inner, ',');
        return halves.length === 2 ? halves[m === 'light' ? 0 : 1].trim() : c;
      };
      const typedLayers = splitTop(String(v), ',').map(x => x.trim());
      const nowLayers = splitTop(now, ',').map(x => x.trim());
      const paired =
        typedLayers.length === nowLayers.length &&
        typedLayers.every(l => colorOf(l)) &&
        nowLayers.every(l => colorOf(l))
          ? typedLayers
              .map((l, i) => {
                const typedColor = /** @type {string} */ (colorOf(l));
                const kept = halfOf(
                  /** @type {string} */ (colorOf(nowLayers[i])),
                  other,
                );
                return l.replace(
                  typedColor,
                  s.mode === 'dark'
                    ? `light-dark(${kept}, ${typedColor})`
                    : `light-dark(${typedColor}, ${kept})`,
                );
              })
              .join(', ')
          : null;
      refuse(
        E.ERR_THEME_NO_MODE,
        `--mode takes a plain color; ${thing} mixes colors with sizes, so --mode cannot hold it. Its colors can still differ between light and dark: write each in the value as light-dark(<light>, <dark>).${paired ? '' : ` Only the colors can differ: the ${other} ${thing} has ${nowLayers.length} layer${nowLayers.length === 1 ? '' : 's'} with their own sizes, so a value of ${typedLayers.length} changes the ${other} mode too.`}`,
        {
          run: [
            paired
              ? `${P} set ${slug} ${thing} ${quoteCommandArgument(paired)}${onFlag}   # the colors in ${s.mode} only, ${other} kept`
              : `${P} set ${slug} ${thing} ${quoteCommandArgument(v)}${onFlag}   # both modes`,
          ],
        },
      );
    }
    // Only colors differ by mode. undo still removes a setting an earlier
    // release saved for one mode.
    if (s.mode && type !== 'color' && !unset)
      refuse(
        E.ERR_THEME_NO_MODE,
        `${thing} is ${/^[aeiou]/.test(type) ? 'an' : 'a'} ${type === 'other' ? 'value of its own kind' : type}, so it is the same in light and dark; drop --mode. Only colors differ by mode.`,
        {
          run: [
            unset
              ? `${P} undo ${slug} ${thing}${onFlag}`
              : `${P} set ${slug} ${thing} ${quoteCommandArgument(v)}${onFlag}`,
          ],
        },
      );
    // The main or supporting text color on a part whose text sits on
    // Core's media surface inside it never reaches that text.
    if (
      !unset &&
      s.on &&
      !s.state &&
      /^--color-text-(primary|secondary)$/.test(thing)
    )
      mediaTextRefusal(ctx, slug, s, v);
    s.source = 'token';
    if (unset) return s;
    if (step)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"more"/"less" work only on dials (${Object.keys(DIALS).join(', ')}). Give ${thing} a ${type} value.`,
        {run: [setLine(slug, thing, exampleOf(type, thing), s)]},
      );
    checkTypedValue(
      type,
      v,
      thing,
      TOKENS,
      C.typeOf,
      slug,
      C.propsReading(thing),
      multipliedTokens(ctx.project).has(thing),
      data.settings.some(x => x.thing === thing),
    );
    checkCycle(thing, v, TOKENS, data, ctx.project.cwd, s, element);
    // With no part data, what reads the token is unknown: save, unchecked.
    if (ctx.unchecked) return s;
    const parts = partsOf(ctx, s);
    if (parts.length) {
      // A part the base theme's own rule makes read the token reads it.
      const results = parts.map(
        t =>
          /** @type {[string, import('./_compiler.mjs').CheckFailure | null]} */ ([
            t,
            baseComponentReads(ctx.project.cwd, data.like, t).has(thing)
              ? null
              : C.checkTokenOn(
                  slug,
                  t,
                  thing,
                  v,
                  P,
                  s.when,
                  // (The state and the mode asked go on the line too.)
                  `${s.state ? ` --state ${s.state}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}`,
                ),
          ]),
      );
      const recorded = results.filter(([, r]) => !r?.soft);
      const hard = recorded.filter(([, r]) => r);
      const spread = Boolean(
        groupsOf(ctx)[s.on ?? ''] || (familyOf(s.on ?? '') && parts.length > 1),
      );
      // A part with no record is judged by its group: refused when no
      // member that has a record reads the token, as the group form is.
      const fam = s.on ? familyOf(s.on) : null;
      if (!recorded.length && fam && !spread) {
        const siblings = groupsOf(ctx)[fam].filter(t => C.MAP[t]);
        const famResults = siblings.map(
          t =>
            /** @type {[string, import('./_compiler.mjs').CheckFailure | null]} */ ([
              t,
              C.checkTokenOn(slug, t, thing, v, P),
            ]),
        );
        if (famResults.length && famResults.every(([, r]) => r)) {
          const r = /** @type {import('./_compiler.mjs').CheckFailure} */ (
            famResults[0][1]
          );
          refuse(
            E.ERR_THEME_NO_EFFECT,
            `No part of the ${fam} group reads ${thing}, so ${s.on} cannot either. ${r.message}`,
            {
              run: r.run.map(x =>
                x.replace(`--on ${famResults[0][0]}`, `--on ${s.on}`),
              ),
              also: r.also,
            },
          );
        }
        if (famResults.length)
          s.note = `${s.on} has no compiled record; checked against the ${fam} group, where ${famResults
            .filter(([, r]) => !r)
            .map(([t]) => t)
            .join(', ')} read ${thing}`;
      } else if (
        recorded.length &&
        hard.length === recorded.length &&
        !statusTwin(C, recorded, thing, s.when)
      ) {
        const [t0, r0] =
          /** @type {[string, import('./_compiler.mjs').CheckFailure]} */ (
            hard[0]
          );
        refuse(E.ERR_THEME_NO_EFFECT, r0.message, {
          run: r0.run.map(x =>
            spread ? x.replace(`--on ${t0}`, `--on ${s.on}`) : x,
          ),
          also: r0.also,
        });
      } else if (hard.length) {
        // Some members read it and take the change; name them, and say
        // what the others read instead (from the check's own message).
        const readers = recorded.filter(([, r]) => !r).map(([t]) => t);
        const instead = /reads: ([^.]+)\./.exec(
          String(/** @type {any} */ (hard[0][1])?.message ?? ''),
        )?.[1];
        s.note = `${readers.length ? `${readers.join(', ')} read ${thing} and take this change; ` : ''}the editor's render of ${hard.map(([t]) => t).join(', ')} did not read it${instead ? ` (${hard[0][0]} reads ${instead})` : ''}, so those stay as they were; each part is rendered with its default props, each variant value and each look flag, so a state or a combination that reads it may be missed`;
      }
      if (!s.note && recorded.length) {
        const fed = C.feeds(recorded[0][0], thing);
        if (fed.length) s.note = `feeds ${C.fmtFeeds(fed, recorded[0][0])}`;
      }
      const soft = results.filter(([, r]) => r?.soft);
      if (!s.note && soft.length && soft.length === results.length)
        s.note = /** @type {import('./_compiler.mjs').CheckFailure} */ (
          soft[0][1]
        ).message;
    } else {
      const r = C.checkTokenGlobal(thing, P);
      // Tokens whose default is built from this one: a part that reads
      // them sees the change.
      const fed = r
        ? Object.entries(TOKENS)
            .filter(
              ([k, v]) =>
                k !== thing && new RegExp(`var\\(${thing}[,)]`).test(String(v)),
            )
            .map(([k]) => k)
        : [];
      // A token a dial writes is always accepted, so a dial's notes never
      // name a token `set` refuses.
      if (r && fed.length)
        s.note = `no part reads ${thing} itself, but ${fed.slice(0, 4).join(', ')} ${fed.length > 1 ? 'are' : 'is'} built from it, so the change shows wherever ${fed.length > 1 ? 'those are' : 'that is'} used${fed.some(k => k.startsWith('--color-syntax-')) ? ' (such as diff rows in code blocks)' : ''}`;
      else if (r && data.like && baseReads(ctx, data.like, thing))
        s.note = `the ${data.like} theme's own part styles read ${thing}, so the change shows where they use it`;
      else if (r && coreStylesRead(ctx, thing))
        s.note = `Core's stylesheet reads ${thing} outside the parts the editor renders (such as the page behind them, the app shell), so the change shows where it is used`;
      else if (r && dialWrites(thing))
        s.note = `no part of this Core reads ${thing}, and no token it feeds is read, so it changes nothing you see now; it is set as asked because a dial writes it too`;
      // The editor's record of what parts read comes from one render of
      // each part, so it misses variants it did not render: a whole-theme
      // token is set as asked, and the result says nothing was seen
      // reading it.
      else if (r)
        s.note = `no part the editor rendered reads ${thing} (each part is rendered with its default props, each variant value and each look flag, so a state or a combination that reads it may be missed); it is set as asked, and reaches any part that reads it`;
    }
    return s;
  }
  // A property in camel case, or with `_` or spaces for its dashes
  // (backgroundColor, font_size, "border radius"), is that property: one
  // reading, so each form gets the same answer.
  const prop = propertySpelling(thing) ?? kebab(thing);
  // A token typed without its leading dashes (color-accent,
  // text-body-size): the token, when no CSS property has that name.
  if (
    !unset &&
    !thing.startsWith('-') &&
    `--${thing}` in TOKENS &&
    !cssProperties().has(thing)
  )
    refuse(
      E.ERR_THEME_UNKNOWN_THING,
      `"${thing}" is not a dial, a token, or a CSS property; the token is --${thing}.`,
      {
        didYouMean: [`--${thing}`],
        run: [
          `${P} set ${slug} --${thing}${value ? ` ${quoteCommandArgument(value)}` : ''}`,
        ],
      },
    );
  // A dial typed in other letters (Font, FONT) is the dial, not the CSS
  // property of the same name.
  if (thing !== thing.toLowerCase() && DIALS[thing.toLowerCase()])
    refuse(
      E.ERR_THEME_UNKNOWN_THING,
      `"${thing}" is not a dial, a token, or a CSS property. The dial for that is ${thing.toLowerCase()}.`,
      {
        didYouMean: [thing.toLowerCase()],
        run: [
          unset
            ? `${P} undo ${slug} ${thing.toLowerCase()}${s.on ? ` --on ${s.on}` : ''}`
            : `${P} set ${slug} ${thing.toLowerCase()} ${quoteCommandArgument(v || 'inter')}${s.on ? ` --on ${s.on}` : ''}`,
        ],
      },
    );
  if (cssProperties().has(prop)) {
    if (!s.on)
      refuse(
        E.ERR_MISSING_ARGUMENT,
        `${prop} is a CSS property, so it needs --on <part|group>. For the whole theme use a dial or a token.`,
        {
          // A part named in the value as a label (`'card: #eeeeee'`, pasted
          // from notes): that value on that part. Else the theme-wide dial
          // or token for it, when there is one; never a part that was not
          // named.
          run: [
            ...(() => {
              const named = partInValue(ctx, String(v ?? ''));
              return named
                ? [
                    `${P} set ${slug} ${prop} ${quoteCommandArgument(named.value)} --on ${named.on}${named.state ? ` --state ${named.state}` : ''}`,
                  ]
                : [];
            })(),
            ...(v && WHOLE_THEME_EQUIVALENT[prop]
              ? (() => {
                  const token = WHOLE_THEME_EQUIVALENT[prop];
                  // A page or text color the theme shows in one mode only
                  // (a dark page in a theme with both modes) is offered for
                  // that mode first: the same color in both would leave the
                  // other unreadable, as `how` answers it.
                  const mode = modeColorBelongs(ctx, data, token, v);
                  const line = (/** @type {string} */ m) =>
                    `${P} set ${slug} ${token} ${quoteCommandArgument(v)}${m ? ` --mode ${m}` : ''}`;
                  return mode ? [line(mode), line('')] : [line('')];
                })()
              : []),
            `${HOW} ${quoteCommandArgument(prop)}`,
          ],
        },
      );
    s.source = 'property';
    s.thing = prop;
    if (unset) return s;
    // A property that reads a design token of a kind it does not take (a
    // color property reading a size, a length reading a color) gets
    // nothing the browser keeps: refused like the token form.
    const mismatch = tokenKindMismatch(ctx, prop, v);
    if (mismatch) {
      const length = mismatch.takes === 'a length';
      const like = /radius/.test(prop)
        ? 'var(--radius-container)'
        : /^(padding|margin|gap|row-gap|column-gap|inset)/.test(prop)
          ? 'var(--spacing-4)'
          : null;
      refuse(E.ERR_THEME_BAD_VALUE, `${mismatch.message}.`, {
        run: [
          ...(length && like
            ? [
                `${P} set ${slug} ${prop} ${quoteCommandArgument(v.replace(new RegExp(`var\\(\\s*${mismatch.token}\\s*(,[^)]*)?\\)`, 'i'), like))} --on ${quoteCommandArgument(String(s.on))}${s.state ? ` --state ${s.state}` : ''}${s.when ? ` --when ${quoteCommandArgument(s.when)}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}`,
              ]
            : []),
          `${HOW} --list tokens ${length ? (/radius/.test(prop) ? 'radius' : 'spacing') : mismatch.takes === 'a color' ? 'color' : ''}`.trimEnd(),
        ],
      });
    }
    // initial and unset leave a part's padding variables without a value:
    // the part takes Core's own default, which the result names.
    if (
      /^padding/.test(prop) &&
      /^(initial|unset|inherit|revert|revert-layer)$/i.test(v.trim()) &&
      s.on
    ) {
      const owner = (ctx.derived?.[s.on] ?? []).some(
        d => d.property === 'padding' && d.expand,
      )
        ? s.on
        : CARD_LIKE.includes(s.on)
          ? 'card'
          : null;
      const fallback = owner
        ? coreFallback(ctx.project, `--astryx-${owner}-padding`)
        : null;
      if (fallback) {
        const token = /^var\((--[a-z0-9-]+)\)$/i.exec(fallback)?.[1];
        const px = token
          ? lengthPx(String(ctx.project.core.tokenDefaults?.[token] ?? ''))
          : lengthPx(fallback);
        s.note = `${v.trim()} means ${s.on}'s own default padding from Core: ${fallback}${px != null ? ` (${px}px)` : ''}`;
      }
    }
    // A part whose Core box reads this property's variable inside calc()
    // (a composer's or a menu's padding in its corners): one length is all
    // that works there, whether a length, a variable, or calc(), min(),
    // max() or clamp() giving one.
    if (s.on && ctx.derived && !WRAPPED_PARTS[s.on]) {
      const inCalc = calcVars(ctx.project);
      const hit = partsOf(ctx, s).find(t =>
        (ctx.derived?.[t] ?? []).some(
          d =>
            d.property === camel(prop) &&
            (d.vars ?? []).some(x => inCalc.has(x.toLowerCase())),
        ),
      );
      // (A radius of two to four corners, each one length, is written as
      // each corner on the box, and its first corner as the one length the
      // variable takes: the build's corner radii, so it is taken.)
      const corners =
        prop === 'border-radius' &&
        splitTop(v.trim(), '/').every(half => {
          const w = splitTop(half.trim(), ' ').filter(Boolean);
          return (
            w.length >= 1 &&
            w.length <= 4 &&
            w.every(x => oneLength(x) || /^0+(?:\.0+)?$/.test(x))
          );
        }) &&
        (splitTop(v.trim(), ' ').filter(Boolean).length > 1 || v.includes('/'));
      // A bare 0 is a length everywhere in CSS but inside calc(), where it
      // is a number: it is saved as 0px, the length it means.
      if (hit && /^[+-]?0*\.?0+$/.test(v.trim())) {
        s.value = '0px';
        const said = `${v.trim()} is saved as 0px: ${hit} reads ${prop} inside calc(), where a bare 0 is not a length`;
        s.note = s.note ? `${s.note}; ${said}` : said;
      } else if (hit && !oneLength(v) && !corners) {
        const first = splitTop(v.trim(), ' ')[0] ?? '';
        const n = cssNumber(first);
        const fix = oneLength(first)
          ? first
          : n && !n.unit
            ? `${n.value}px`
            : '12px';
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `${hit} reads ${prop} inside calc() (its corners and inner rows follow it), where only one length works: a length, a variable, or calc(), min(), max() or clamp() giving one; not "${v.trim()}".`,
          {run: [setLine(slug, prop, fix, s)]},
        );
      }
    }
    // A part whose visible box is drawn inside its themed wrapper: only
    // what reaches that box is taken.
    const wrapped = s.on ? WRAPPED_PARTS[s.on] : undefined;
    if (wrapped) {
      const surface =
        /^(background|border|box-shadow|outline)(-|$)/.test(prop) &&
        !/radius/.test(prop);
      const side = /^padding-/.test(prop);
      const density = prop === 'padding' && /^density:/.test(s.when ?? '');
      // Core reads the box's padding only from a variable of its own, which
      // a theme may not write, and a padding property would pad the
      // transparent wrapper too.
      if (prop === 'padding' && !density)
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${s.on}'s theme class is on a transparent wrapper; ${wrapped.box} inside it reads its padding from a variable of Core's own, which a theme cannot set, and a padding on the wrapper would add a gap outside the box. Its padding follows the theme's spacing.`,
          {run: [`${HOW} ${s.on}`]},
        );
      if (surface || side || density)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          surface
            ? `${s.on}'s theme class is on a transparent wrapper; Core draws ${wrapped.box} inside it, and that box has no class of its own, so ${prop} would paint the wrapper's square corners, not the box. Its colors come from the theme's popover tokens.`
            : side
              ? `${s.on}'s theme class is on a transparent wrapper; ${wrapped.box} inside it reads one padding for every side, so a side padding would add a strip outside the box. Set padding (every side).`
              : `${s.on} sets its own padding on ${wrapped.box} for each density, which a theme padding for one density cannot reach. Set padding for every density.`,
          {
            run: surface
              ? [
                  `${P} set ${slug} --color-background-popover ${quoteCommandArgument('#ffffff')}`,
                  `${HOW} ${s.on}`,
                ]
              : [`${HOW} ${s.on}`],
          },
        );
    }
    // A property Core paints with an inline style from a token outranks any
    // theme rule for it: the token the inline style reads is what changes it.
    // A paint Core always makes (an indicator's focus ring) is changed by the
    // token on the part with no state. A paint in a state (a selected table
    // row's wash) is changed by the token in that state; a component option
    // can turn that paint off (a table without its row highlight), and then
    // a rule in the state applies, so the refusal says both.
    if (!unset) {
      const family =
        prop === 'background' || prop === 'background-color'
          ? 'background-color'
          : prop;
      const inline = partsOf(ctx, s)
        .map(t => {
          const at = ctx.C.MAP[t]?.inline ?? {};
          const tok =
            (s.state ? at[s.state]?.[family] : undefined) ?? at['']?.[family];
          return /** @type {const} */ ([t, tok]);
        })
        .find(([, tok]) => tok);
      if (inline) {
        const [part, token] = inline;
        const alwaysInline = Boolean(ctx.C.MAP[part]?.inline?.['']?.[family]);
        refuse(
          E.ERR_THEME_NO_EFFECT,
          alwaysInline
            ? `Core paints ${part}'s ${family} as an inline style from ${token}, which no theme rule can replace; set ${token} on ${part} instead.`
            : `By default Core paints ${part}'s ${family} when ${s.state} as an inline style from ${token}, which no theme rule can replace, so set ${token} on ${part} when ${s.state} instead; only where the component is set not to paint it (such as a table with its row highlight off) does a ${s.state} ${family} apply, and there ${token} paints nothing.`,
          {
            run: [
              `${P} set ${slug} ${token} ${quoteCommandArgument(v)} --on ${part}${alwaysInline || !s.state ? '' : ` --state ${s.state}`}${s.mode ? ` --mode ${s.mode}` : ''}`,
            ],
          },
        );
      }
    }
    // A border on a part that draws none itself, whose edges are drawn by
    // parts of its own inside it (a date-time input's date and time boxes):
    // those parts take it.
    if (
      !unset &&
      /^border(?!.*radius)(-|$)/.test(prop) &&
      partsOf(ctx, s).length === 1
    ) {
      const part = partsOf(ctx, s)[0];
      const inner = borderParts(ctx, part).filter(t => t !== part);
      if (inner.length)
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${part} draws no border of its own; its edges are the borders of ${inner.join(' and ')}, so set ${prop} on ${inner.length > 1 ? 'those parts' : 'that part'}.`,
          {
            run: inner.map(t =>
              setLine(slug, prop, v, {...s, on: t, only: undefined}),
            ),
          },
        );
    }
    // Padding on a part Core renders as a box CSS draws no padding on (a
    // table row): the parts inside it with padding of their own take it.
    if (
      !unset &&
      /^padding(-|$)/.test(prop) &&
      !s.state &&
      partsOf(ctx, s).length === 1
    ) {
      const part = partsOf(ctx, s)[0];
      const inner = paddedParts(ctx, part).filter(t => t !== part);
      if (inner.length)
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${part} is drawn as a table row, row group or column, which CSS draws no padding on; its space is the padding of ${inner.join(' and ')}, so set ${prop} on ${inner.length > 1 ? 'those parts' : 'that part'}.`,
          {
            run: inner.map(t =>
              setLine(slug, prop, v, {...s, on: t, only: undefined}),
            ),
          },
        );
    }
    // A text color on a part whose text sits on Core's media surface inside
    // it (a toast's inverted surface) never reaches that text: the surface
    // sets it from the on-dark and on-light colors, which the part takes.
    if (!unset && !s.state && prop === 'color')
      mediaTextRefusal(ctx, slug, s, v);
    // A property the part data records from a line inside the part (a
    // divider's line fill) is drawn by that line, not the part's element:
    // set on the part, it paints under the line and never shows.
    if (!unset) lineRefusal(ctx, slug, s, prop, v);
    // An outline's color, width or offset on a part that draws no outline
    // (Core's outline: none, an input's) never shows while no outline
    // style is set for it.
    if (!unset && /^outline-(color|width|offset)$/.test(prop))
      noOutlineRefusal(ctx, slug, data, s, prop, v);
    // A text property on a part whose text is drawn by elements inside it
    // that set that property themselves from a token (a top nav heading's
    // title span) never reaches that text: the token, on the part, does.
    // So does a part whose text is all in parts inside it that each set
    // the property themselves (a dialog's title block: its title and
    // subtitle).
    if (
      !unset &&
      !s.state &&
      [
        'font-size',
        'font-weight',
        'line-height',
        'letter-spacing',
        'color',
      ].includes(prop)
    ) {
      const inner = partsOf(ctx, s)
        .map(t => /** @type {const} */ ([t, innerPropTokens(ctx.C, t, prop)]))
        .filter(([, toks]) => toks.length);
      // One token for each part (a banner's text size, --text-label-size):
      // the value goes into it on the part (compileTheme), and the result
      // says so. With several (a top nav heading's title and subtitle
      // sizes), which one is meant is not known: the refusal names each.
      const oneEach =
        prop !== 'color' && inner.every(([, toks]) => toks.length === 1);
      if (inner.length && inner.length === partsOf(ctx, s).length && oneEach) {
        const said = inner
          .map(
            ([part, [tok]]) =>
              `${part}'s text is drawn by elements inside it that set their own ${prop} from ${tok}, so the value goes into ${tok} on ${part}`,
          )
          .join('; ');
        s.note = s.note ? `${s.note}; ${said}` : said;
      } else if (inner.length && inner.length === partsOf(ctx, s).length) {
        const [part, toks] = inner[0];
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${part}'s text is drawn by elements inside it that set their own ${prop} from ${toks.join(', ')}, so a ${prop} on ${part} never reaches it; set ${toks.length > 1 ? 'one of those tokens' : 'that token'} on ${part} instead.`,
          {
            run: toks.map(
              tok =>
                `${P} set ${slug} ${tok} ${quoteCommandArgument(v)} --on ${part}`,
            ),
          },
        );
      }
    }
    // A text property CSS inherits that an element inside the part sets
    // itself, to a value the component's props choose (a code block's lines:
    // white-space pre, or pre-wrap when wrapped), never reaches the text
    // that element holds: the prop decides it, never the theme. Refused,
    // naming the values there.
    if (!unset && INHERITED_TEXT.test(prop)) {
      const held = partsOf(ctx, s)
        .map(t => /** @type {const} */ ([t, ctx.C.MAP[t]?.innerSets?.[prop]]))
        .filter(
          ([t, vals]) =>
            Array.isArray(vals) &&
            vals.length > 1 &&
            !ctx.C.MAP[t]?.own?.[prop] &&
            innerPropTokens(ctx.C, t, prop).length === 0,
        );
      if (held.length && held.length === partsOf(ctx, s).length) {
        const [part, vals] = held[0];
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${part}'s text is laid out by an element inside it that sets its own ${prop} (${/** @type {string[]} */ (vals).join(' or ')}, as the component's props choose), so ${prop} on ${part} never shows; the app chooses it with that prop, never the theme.`,
          {run: [`${HOW} ${part}`]},
        );
      }
    }
    // A text property CSS inherits reaches the parts inside the part that
    // do not set it themselves (a side nav section's items): the result
    // says which.
    if (!unset) {
      const reach = inheritedReach(ctx, s, prop);
      if (reach) s.note = s.note ? `${s.note}; ${reach}` : reach;
    }
    // Text, headings and links take their color from the color prop.
    const textParts = COLOR_PROP_PARTS;
    // A text, heading or link color is written as the text color tokens
    // its color prop reads, on that part alone (compileTheme), so it shows.
    const propTokens = partsOf(ctx, s).map(t => colorPropTokens(ctx, t, s.when));
    // (A value that is no color is refused below, with the nearest color.)
    const propColor =
      prop === 'color' &&
      isColorValue(v) &&
      propTokens.length > 0 &&
      propTokens.every(k => k.length);
    if (propColor && partsOf(ctx, s).some(t => t !== 'heading')) {
      const toks = [...new Set(propTokens.flat())];
      const said = `the color goes into ${toks.join(' and ')} on ${s.on}, the ${toks.length > 1 ? 'tokens' : 'token'} its color prop reads (Core sets that prop after part styles)`;
      s.note = s.note ? `${s.note}; ${said}` : said;
    }
    if (
      !propColor &&
      (prop === 'color' || prop === '-webkit-text-fill-color') &&
      partsOf(ctx, s).some(t => textParts.includes(t))
    ) {
      if (partsOf(ctx, s).every(t => textParts.includes(t))) {
        const named = /^color:([\w-]+)$/.exec(s.when ?? '')?.[1];
        // The typed value goes into the token only when it is a plain color;
        // else the nearest color name, else an example.
        const color =
          v && isColorValue(v) && isFixedColor(v) && !/\bvar\(/i.test(v)
            ? v
            : (nearestColorName(v) ?? '#1f2937');
        // The tokens the part's color prop reads (colorPropTokens), set on
        // the part alone.
        const colors = colorPropTokens(
          ctx,
          /** @type {string} */ (s.on),
          s.when,
        ).map(t => t.replace(/^--color-text-/, ''));
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${s.on} takes its color from the color prop, which Core sets after part styles, so a color set on ${s.on} never shows. Set the token its color prop reads (${colors.map(c => `${c}: --color-text-${c}`).join('; ')}) on ${s.on} instead.`,
          {
            // The token on the part, in the scope typed: a hovered link's
            // color is the hovered link's token, never every link's.
            run: colors.map(c =>
              setLine(slug, `--color-text-${c}`, color, {
                ...s,
                when: named ? undefined : s.when,
              }),
            ),
          },
        );
      }
      s.note = `text, heading and link inside ${s.on} keep the color their color prop gives; set --color-text-primary for those`;
    }
    // One mode on a part whose variants each read their own color is
    // written to each variant's rule with that variant's own other half
    // (compileTheme), so it needs no variant named.
    if (!isSafeValue(v))
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${v}" cannot be a CSS value: ${UNSAFE_VALUE}.`,
        {
          // The value without its copy debris, when that is one.
          run: [
            withoutCopyDebris(v) !== v && isSafeValue(withoutCopyDebris(v))
              ? setLine(slug, prop, withoutCopyDebris(v), s)
              : `${HOW} ${prop}`,
          ],
        },
      );
    if (/radius$/.test(prop)) refuseInvisibleCorners(ctx, slug, s, data);
    if (step)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"more"/"less" work only on dials. Give ${prop} an exact CSS value.`,
        {run: [`${HOW} ${prop}`]},
      );
    const grammar = propertyProblem(prop, v);
    if (grammar)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${prop} takes ${grammar.takes}; "${v}" is not one.`,
        {
          ...(grammar.near && /^[a-z-]+$/i.test(v)
            ? {didYouMean: [grammar.near]}
            : {}),
          run: grammar.near
            ? [
                // The same scope, --only included.
                setLine(slug, prop, grammar.near, s),
              ]
            : [`${HOW} ${prop}`],
        },
      );
    // A box color shorthand takes a color per side (`#ddd #ddd
    // transparent`), each one read as a color.
    const sides = colorSides(prop, v);
    if (sides?.tooMany)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${prop} takes 1 to ${sides.max} colors, one per side; "${v}" has ${sides.colors.length}.`,
        {run: [`${HOW} ${prop}`]},
      );
    const notColor = sides?.colors.find(
      x => !isColorValue(x.color) || !isFixedColor(x.color),
    );
    if (sides && notColor)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${prop} takes a color for each side; "${notColor.color}" in "${v}" is not one.`,
        {run: [`${HOW} ${prop}`]},
      );
    if (
      !sides &&
      COLOR_PROPS.test(prop) &&
      !CSS_WIDE.includes(v.trim().toLowerCase()) &&
      (!isColorValue(v) || !isFixedColor(v))
    ) {
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `${prop} takes a color; "${v}" is not one.${/gradient/.test(v) ? ' Gradients go in background.' : ''}`,
        {
          run: /gradient/.test(v)
            ? [
                `${P} set ${slug} background ${quoteCommandArgument(v)} --on ${s.on}`,
              ]
            : [
                `${P} set ${slug} ${prop} ${quoteCommandArgument(nearestColorName(v) ?? exampleOf('color', prop))} --on ${s.on}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}`,
              ],
        },
      );
    }
    // A var() inside a color (color-mix(in srgb, var(--x, 12px), red)) shows
    // its fallback when the variable is unset: that must be a color too,
    // except in a color's channels (rgb(var(--r, 0) 0 0)).
    if (COLOR_PROPS.test(prop) || (prop === 'background' && isColorValue(v)))
      for (const {fallback, within} of innerVarFallbacks(v)) {
        if (
          within.some(f =>
            /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i.test(f),
          ) ||
          /\bvar\(/i.test(fallback)
        )
          continue;
        if (fallback === '' || !isColorValue(fallback))
          refuse(
            E.ERR_THEME_BAD_VALUE,
            fallback === ''
              ? `${prop} takes a color; the var() in "${v}" has an empty fallback, which leaves it with no color when the variable is unset.`
              : `${prop} takes a color; "${fallback}", a var() fallback in "${v}", is not one, so the ${prop} is lost when the variable is unset.`,
            {run: [setLine(slug, prop, exampleOf('color', prop), s)]},
          );
      }
    // Every scope flag but --mode carries into the runs.
    const whenFlag = `${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}${s.only ? ' --only' : ''}`;
    if (
      s.mode &&
      !COLOR_PROPS.test(prop) &&
      !(prop === 'background' && isColorValue(v)) &&
      // A gradient background (no image file) goes per mode: its colors
      // are each painted in that mode only (compileTheme).
      !(
        /^background(-image)?$/.test(prop) &&
        /gradient\(/i.test(v) &&
        !/url\(/i.test(v)
      )
    ) {
      // A shorthand's color can go per mode through its color longhand
      // (border-color for border), set for that mode alone: the other mode
      // keeps its color. Its other words (width, style) are not colors, so
      // they are set for both modes, as their own longhands. A value with
      // no color (a radius) is just set for both modes.
      const words = splitTop(String(v).trim(), ' ').filter(Boolean);
      const colorWord = /gradient\(/i.test(v)
        ? null
        : (words.find(
            w =>
              isColorValue(w) &&
              !/^(currentcolor|inherit|initial|unset|revert)$/i.test(w),
          ) ?? null);
      const longhandOf = (/** @type {string} */ part) =>
        cssProperties().has(`${prop}-${part}`) ? `${prop}-${part}` : null;
      // The longhands a shorthand's words go to, from CSS's own names.
      const alt = !colorWord
        ? null
        : prop === 'background'
          ? 'background-color'
          : longhandOf('color') && COLOR_PROPS.test(`${prop}-color`)
            ? `${prop}-color`
            : null;
      // A line (a border, one side's border, an outline) the part does not
      // draw now would appear in the other mode too, with its current
      // color: only a line the part draws takes its color by mode here.
      const lined = /^(?:border(?:-(?:top|right|bottom|left))?|outline)$/.test(
        prop,
      );
      const undrawn =
        lined && !drawsLine(C, partsOf(ctx, s), prop, s.state ?? null);
      // On a part whose variants each have their own color, the color per
      // mode is set for one variant at a time (as that refusal says): the
      // step names the default one, or the first.
      let altWhen = '';
      if (alt === 'background-color' && !s.when) {
        const g = C.groupOfProp(alt);
        const variants = [
          ...new Set(
            partsOf(ctx, s).flatMap(t =>
              (g ? C.partReads(t, g) : [])
                .filter(r => r.props.includes(alt))
                .flatMap(r => r.when)
                .map(w => /^variant=([\w-]+)$/.exec(w)?.[1])
                .filter(Boolean),
            ),
          ),
        ];
        const plain = partsOf(ctx, s).some(t =>
          (g ? C.partReads(t, g) : []).some(
            r => r.props.includes(alt) && r.when.includes(''),
          ),
        );
        if (variants.length && !plain)
          altWhen = ` --when variant:${variants.includes('default') ? 'default' : variants[0]}`;
      }
      // The shorthand's other words, each to its own longhand (a width, a
      // style), for both modes: only what the value gives.
      const shapeLines =
        alt && prop !== 'background'
          ? words
              .filter(w => w !== colorWord)
              .map(w => {
                const longhand = ['style', 'width', 'line', 'thickness']
                  .map(longhandOf)
                  .find(
                    lh =>
                      lh &&
                      matchValue(lh, w) &&
                      !(lh.endsWith('-width') && /^(none|hidden)$/.test(w)),
                  );
                return longhand
                  ? `${P} set ${slug} ${longhand} ${quoteCommandArgument(w)}${onFlag}${whenFlag}   # both modes`
                  : null;
              })
          : [];
      const shapeRuns = /** @type {string[]} */ (
        shapeLines.filter(x => x != null)
      );
      // A color with no longhand of its own (a shadow's) goes per mode in
      // the value: light-dark() holds each mode's color, and a part with
      // no such property of its own shows none in the other mode.
      const ownShadow = partsOf(ctx, s).some(t => ctx.C.MAP[t]?.own?.[prop]);
      const inValue =
        !alt &&
        colorWord &&
        /shadow$/.test(prop) &&
        !ownShadow &&
        matchValue(prop, String(v).replace(colorWord, 'red'))
          ? String(v).replace(
              colorWord,
              s.mode === 'dark'
                ? `light-dark(transparent, ${colorWord})`
                : `light-dark(${colorWord}, transparent)`,
            )
          : null;
      const runs = alt
        ? shapeRuns.length < shapeLines.length || undrawn
          ? null
          : [
              ...shapeRuns,
              `${P} set ${slug} ${alt} ${quoteCommandArgument(String(colorWord))}${onFlag}${altWhen}${whenFlag} --mode ${s.mode}   # the color, ${s.mode} only${altWhen ? ', for each variant' : ''}`,
            ]
        : inValue
          ? [
              `${P} set ${slug} ${prop} ${quoteCommandArgument(inValue)}${onFlag}${whenFlag}   # the color in ${s.mode} only`,
            ]
          : null;
      refuse(
        E.ERR_THEME_NO_MODE,
        alt && undrawn
          ? `--mode takes a plain color; ${s.on} draws no ${prop} now, and a line's width and style are the same in both modes, so it would show in the other mode too. Write its color in the value as light-dark(<light>, <dark>), with transparent for the mode that shows none.`
          : alt
            ? `--mode takes a plain color; ${prop} mixes a color with ${words.length > 1 ? 'other words' : 'nothing else'}, so its color goes per mode through ${alt}${shapeLines.length ? `, and its ${prop === 'text-decoration' ? 'line and style' : 'width and style'} for both modes` : ''}.`
            : colorWord && /shadow$/.test(prop)
              ? `--mode takes a plain color; ${prop} mixes a color with sizes, so --mode cannot hold it. Its color can still differ between light and dark: write it in the value as light-dark(<light>, <dark>).`
              : `--mode works on plain colors; ${prop} is not a color, so it is set for both modes.`,
        {
          run: runs ?? [
            colorWord
              ? `${HOW} ${s.on ?? ''}`.trim()
              : `${P} set ${slug} ${prop} ${quoteCommandArgument(v)}${onFlag}${whenFlag}   # both modes`,
          ],
        },
      );
    }
    return s;
  }
  // A property written with _ or spaces, a trailing colon, or in camel
  // case: the property meant.
  const meant = kebab(String(thing).trim().replace(/:$/, ''))
    .replace(/[_\s]+/g, '-')
    .replace(/-+/g, '-');
  if (meant !== prop && cssProperties().has(meant))
    refuse(
      E.ERR_THEME_UNKNOWN_THING,
      `"${thing}" is not a dial, a token, or a CSS property; the property is ${meant}.`,
      {
        didYouMean: [meant],
        run: [
          unset
            ? `${P} undo ${slug} ${meant}${onFlag}`
            : // The scope typed, never a part nobody named: with no --on,
              // set's own answer for the property (its whole-theme dial or
              // token) is folded in when the line is vetted.
              `${P} set ${slug} ${meant} ${quoteCommandArgument(v || exampleOf(groupOfPropType(meant), meant))}${onFlag}`,
        ],
      },
    );
  // The motion knobs of defineTheme (`motion`, its `tempo` and
  // `character`) are no editor setting: the editor sets motion through the
  // duration and ease tokens, which how answers with. A tempo above 1 is
  // slower, below 1 faster.
  if (/^(?:motion|tempo|character)$/i.test(thing)) {
    const tempo = Number(/(\d*\.?\d+)/.exec(v)?.[1]);
    const asks =
      Number.isFinite(tempo) && tempo > 1
        ? ['slower', 'faster']
        : ['faster', 'slower'];
    return refuse(
      E.ERR_THEME_UNKNOWN_THING,
      `"${thing}" is not a dial, a token, or a CSS property. defineTheme's motion knobs (tempo, character) are not editor settings: the editor sets motion through the duration and ease tokens (--duration-*, --ease-*), and how answers for faster or slower motion with them.`,
      {
        run: asks.map(a => `${HOW} ${quoteCommandArgument(`${a} motion`)}`),
      },
    );
  }
  const hint =
    /** @type {((v: string, on: string | undefined) => string[]) | undefined} */ (
      THING_HINTS[thing.toLowerCase()]
    );

  // A dial by another name or case: Accent, gray, saturation, error.
  const lower = thing.toLowerCase();
  // `like`, the word show prints for the base and new's --like: base.
  if (!hint && lower === 'like')
    return refuse(
      E.ERR_THEME_UNKNOWN_THING,
      `"${thing}" is not a dial, a token, or a CSS property. The base is set with base.`,
      {
        didYouMean: ['base'],
        run: [
          unset
            ? `${P} undo ${slug} base`
            : `${P} set ${slug} base ${quoteCommandArgument(v || 'none')}`,
        ],
      },
    );
  // A word people write for a dial, read the way the dial's own words are:
  // with `-color`/`-colour` after it (primary-color), in the plural
  // (shadows), and the words for a mode or a flat surface, which name a
  // dial with a value of their own.
  const aliasesOf = (/** @type {string} */ w) => {
    if (DIALS[w]) return [w];
    const found = COLOR_DIAL_WORDS.get(w);
    if (found) return found;
    const bare = w.replace(/[-_ ]?colou?r$/, '');
    if (bare !== w && (DIALS[bare] || COLOR_DIAL_WORDS.get(bare)))
      return DIALS[bare] ? [bare] : (COLOR_DIAL_WORDS.get(bare) ?? []);
    const singular = w.replace(/e?s$/, '');
    if (singular !== w && (DIALS[singular] || COLOR_DIAL_WORDS.get(singular)))
      return DIALS[singular]
        ? [singular]
        : (COLOR_DIAL_WORDS.get(singular) ?? []);
    return [];
  };
  const aliases = aliasesOf(lower);
  // A word that names a dial AND the value it asks for (`shadows none` is
  // `surfaces flat`, `dark-mode true` is `mode dark-only`): that command,
  // from the one table of such words.
  const asDialValue = dialValueOf(lower, String(v));
  if (!hint && !aliases.length && asDialValue && DIALS[asDialValue.dial])
    return refuse(
      E.ERR_THEME_UNKNOWN_THING,
      `"${thing}" is not a dial, a token, or a CSS property. ${asDialValue.dial} ${asDialValue.value} does that.`,
      {
        didYouMean: [asDialValue.dial],
        run: [
          unset
            ? `${P} undo ${slug} ${asDialValue.dial}`
            : `${P} set ${slug} ${asDialValue.dial} ${asDialValue.value}`,
        ],
      },
    );
  if (!hint && aliases.length)
    return refuse(
      E.ERR_THEME_UNKNOWN_THING,
      `"${thing}" is not a dial, a token, or a CSS property. ${aliases.length > 1 ? `The dials ${aliases.join(' and ')} mean that` : `The dial for that is ${aliases[0]}`}.`,
      {
        didYouMean: aliases,
        run: aliases.map(d =>
          unset
            ? `${P} undo ${slug} ${d}${onFlag}`
            : `${P} set ${slug} ${d} ${quoteCommandArgument(valueFor(d, v))}${onFlag}`,
        ),
      },
    );
  // A dial or property name a letter or two off (accnt, cornrs,
  // backgrund-color): the one name the typo limit reads it as, as the set
  // line with the value and scope kept.
  const nearNames = hint
    ? []
    : [...Object.keys(DIALS), ...cssProperties()].filter(n =>
        typoNear(prop, n),
      );
  const typoLine =
    !unset && nearNames.length === 1 && v.trim()
      ? `${P} set ${slug} ${setArgs({...s, thing: nearNames[0]}, v)}`
      : null;
  return refuse(
    E.ERR_THEME_UNKNOWN_THING,
    `"${thing}" is not a dial, a token, or a CSS property.`,
    {
      // A hint names this theme and the part (card when none is given),
      // and a corners value corners takes.
      run: hint
        ? (/corners/.test(String(hint('', ''))) &&
          v.trim() &&
          !YES_NO.test(v.trim()) &&
          cornersRead(v) == null
            ? // A value corners cannot read: how corners, never a stock rung.
              [`${HOW} corners`]
            : hint(
                /corners/.test(String(hint('', ''))) && !YES_NO.test(v.trim())
                  ? (cornersRead(v) ?? '')
                  : v,
                s.on,
              )
          ).map(x =>
            x
              .replace(/<theme>/g, slug)
              .replace(/<part>/g, 'card')
              .replace(/"([^"]*)"/g, (_, q) => quoteCommandArgument(q)),
          )
        : // A list that answers, not a question the parser may not match.
          [
            ...(typoLine ? [typoLine] : []),
            `${HOW} --list properties`,
            `${HOW} --list dials`,
          ],
      didYouMean: hint
        ? []
        : nearest(prop, [...Object.keys(DIALS), ...cssProperties()]),
    },
  );
}

/**
 * Refuse the corners dial on parts that are all radios' circles
 * (radioCircle): the dial leaves them, so it changes nothing you see. A
 * border-radius set on the part itself still changes it.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').Setting} s
 * @param {import('./_settings.mjs').ThemeData} data
 */
function refuseRadioCorners(ctx, slug, s, data) {
  if (ctx.unchecked) return;
  const parts = partsOf(ctx, s);
  if (!parts.length || !parts.every(t => radioCircle(ctx.C, t))) return;
  // A radius set on the part itself overrides the circle: a square radio
  // is asked of this component, by name. A fully round ask (pill, round)
  // is the circle it has: with a radius the theme set on it, the undo of
  // that radius gives the circle back.
  const px = cornerPxOf(String(s.value));
  const saved = (data?.settings ?? []).find(
    (/** @type {any} */ x) =>
      x.thing === 'border-radius' &&
      x.on === s.on &&
      !x.when &&
      !x.state &&
      !x.mode,
  );
  const round = !Number.isFinite(px) || px >= 9999;
  const own = !round
    ? setLine(slug, 'border-radius', px === 0 ? '0' : `${px}px`, s)
    : saved
      ? `${P} undo ${slug} border-radius --on ${s.on}`
      : null;
  refuse(
    E.ERR_THEME_NO_EFFECT,
    `${s.on} is a radio's circle (border-radius 50%), not a corner, so the corners dial leaves it and changes nothing you see.${round ? (saved ? ` ${slug} sets border-radius ${saved.value} on it; undoing that gives the circle back: ${String(own).replace(`${P} `, '')}.` : ` It is fully round already.`) : own ? ` A border-radius on it sets its shape: ${own.replace(`${P} `, '')}.` : ''}`,
    {run: own ? [own] : [`${HOW} ${s.on}`]},
  );
}

/**
 * Refuse rounding a part that shows no edge: no background, border, shadow
 * or radius of its own, so a radius on it changes nothing you see.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} slug
 * @param {import('./_settings.mjs').Setting} s
 * @param {import('./_settings.mjs').ThemeData} data
 */
function refuseInvisibleCorners(ctx, slug, s, data) {
  if (ctx.unchecked) return;
  const parts = partsOf(ctx, s);
  if (!parts.length || parts.some(t => ctx.C.showsCorners(t))) return;
  // The corners dial on a part whose corners are drawn by parts of its own
  // inside it (a date-time input's date and time boxes) rounds those.
  if (
    s.thing === 'corners' &&
    parts.some(t => cornerParts(ctx, t).some(x => x !== t))
  )
    return;
  // An edge the theme gives the part itself shows its corners too.
  const edged = data.settings.some(
    x =>
      x.source === 'property' &&
      /^(background|border|box-shadow|outline)/.test(x.thing) &&
      partsOf(ctx, x).some(t => parts.includes(t)),
  );
  if (edged) return;
  const kids = (ctx.C.MAP[parts[0]]?.contains ?? [])
    .filter(k => ctx.C.showsCorners(k) && ctx.C.MAP[k])
    .slice(0, 3);
  refuse(
    E.ERR_THEME_NO_EFFECT,
    `${s.on} has no background, border or shadow of its own, so rounding its corners changes nothing you see. To round ${s.on} itself, give it a background or a border first, then set its corners.${kids.length ? ` Parts inside it that do show an edge: ${kids.join(', ')}.` : ''}`,
    {
      // (How names the fill and border the part takes; the editor offers
      // no value the person did not type.)
      run: [
        `${HOW} ${s.on}`,
        ...kids.map(k =>
          setLine(slug, 'corners', s.value || 'round', {...s, on: k}),
        ),
      ],
    },
  );
}

/**
 * Whether a token is the twin of one the part reads for another variant
 * value: the editor rendered each part once (a banner as info, an icon in
 * its default color), so `--color-error-muted` on a banner, or
 * `--color-icon-pink` on an icon, is read as surely as the recorded
 * `--color-info-muted` or `--color-icon-blue`.
 * @param {import('./_compiler.mjs').Compiler} C
 * @param {Array<[string, unknown]>} recorded
 * @param {string} thing
 * @param {string | undefined} when
 */
function statusTwin(C, recorded, thing, when) {
  const [wp, wv] = (when ?? '').split(':');
  return recorded.some(([t]) =>
    Object.entries(C.variantValues(t)).some(([p, values]) => {
      if (wp && wp !== p) return false;
      // Only the part's own values: a button's destructive variant makes no
      // --color-info its twin.
      const all = values;
      return all.some(
        w =>
          (!wv || w === wv) &&
          new RegExp(`-${w}(-|$)`).test(thing) &&
          all.some(
            o =>
              o !== w &&
              C.allReads(t).has(
                thing.replace(new RegExp(`-${w}(-|$)`), `-${o}$1`),
              ),
          ),
      );
    }),
  );
}

/**
 * Whether a dial writes the token: a color, a heading weight (type,
 * headings), a radius (corners), a spacing or control size (spacing), or a
 * font size (type, text-size).
 * @param {string} token
 */
const dialWrites = token =>
  PALETTE_TOKENS.has(token) ||
  isLookToken(token) ||
  /^--(text-(heading|display)-\d-weight|radius-|spacing-|size-element-|font-size-)/.test(
    token,
  );

/** The aspects `how` answers at the whole-theme level. */
export const ASPECTS = [...Object.keys(GROUPS), 'colors'];

/**
 * A setting's value as set reads it: one line, and tabs as spaces; in a font
 * value every run of spaces or tabs is one space, so `'Open  Sans'` and
 * `'Open\tSans'` both name Open Sans.
 * @param {string} thing
 * @param {string} value
 */
export function normalValue(thing, value) {
  const one = value.replace(/\s*[\r\n]+\s*/g, ' ');
  return (
    thing === 'font' || thing.startsWith('--font-family')
      ? familySpaces(one)
      : one.replace(/\t+/g, ' ')
  ).trim();
}

/** @see familySpaces in _settings.mjs, re-exported for the checks. */
export {familySpaces};

/**
 * The first design token a property's value reads through var() whose kind
 * the property does not take, or null: the value with the var() replaced by
 * a value of the token's kind (the example each kind's refusals give) is
 * one the property's grammar does not take, so the browser drops it.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} prop the property, as CSS names it
 * @param {string} v
 * @returns {{token: string, kind: string, takes: string, message: string} | null}
 */
function tokenKindMismatch(ctx, prop, v) {
  // A value no stand-in makes work (text glued to the var(), as in
  // `var(--x)px`) is wrong around the token, never for the token's kind.
  if (!matchValue(prop, v)) return null;
  for (const ref of varReferences(v)) {
    const m = new RegExp(
      String.raw`^var\(\s*(${CUSTOM_PROPERTY})\s*(?:,[^()]*)?\)$`,
      'i',
    ).exec(ref.text);
    if (!m) continue;
    const token = m[1];
    if (!ctx.C.isToken(token)) continue;
    const kind = ctx.C.typeOf(token);
    if (kind === 'other') continue;
    const sample = `${v.slice(0, ref.at)} ${exampleOf(kind, token)} ${v.slice(ref.at + ref.text.length)}`;
    if (matchValue(prop, sample)) continue;
    const takes =
      matchValue(prop, '1px') && !matchValue(prop, 'red')
        ? 'a length'
        : matchValue(prop, 'red') && !matchValue(prop, '1px')
          ? 'a color'
          : null;
    return {
      token,
      kind,
      takes: takes ?? `no ${kind}`,
      message: takes
        ? `${prop} takes ${takes}; ${token} is a ${kind}, so the browser would drop it`
        : `${prop} takes no ${kind}; ${token} is a ${kind}, so the browser would drop it`,
    };
  }
  return null;
}

/**
 * Why a part's CSS property value is refused, as `set` refuses it, or
 * null: a var() that reads nothing, a color property's value that is no
 * color, or a value the property's grammar does not take.
 * @param {import('./_settings.mjs').Ctx} ctx
 * @param {string} prop the property, as CSS names it
 * @param {string} value
 * @param {Record<string, unknown>} TOKENS
 * @param {ReadonlySet<string>} [reads] custom properties the theme sets where the value is read
 * @returns {string | null}
 */
export function propertyValueProblem(ctx, prop, value, TOKENS, reads) {
  const v = value.trim();
  const ref = unknownVarRef(v, TOKENS, prop, reads);
  if (ref) return ref.message;
  const mismatch = tokenKindMismatch(ctx, prop, v);
  if (mismatch) return mismatch.message;
  if (CSS_WIDE.includes(v.toLowerCase())) return null;
  if (COLOR_PROPS.test(prop)) {
    const sides = colorSides(prop, v);
    const one = (/** @type {string} */ x) =>
      /\bvar\(/i.test(x) || isColorValue(x);
    if (sides)
      return sides.tooMany
        ? `${prop} takes 1 to ${sides.max} colors, one per side; "${v}" has ${sides.colors.length}.`
        : sides.colors.every(x => one(x.color))
          ? null
          : `${prop} takes a color for each side; "${v}" is not that.`;
    return one(v) ? null : `${prop} takes a color; "${v}" is not one.`;
  }
  const grammar = propertyProblem(prop, v);
  return grammar ? `${prop} takes ${grammar.takes}; "${v}" is not one.` : null;
}

/**
 * The first var() in a value that names no design token and would read
 * nothing (no fallback), or one a letter or two off a token, else null.
 * Dials take their own words, so a dial's var() with no near token passes.
 * @param {string} v
 * @param {Record<string, unknown>} TOKENS
 * @param {string} thing
 * @param {ReadonlySet<string>} [reads] custom properties the theme itself
 *   sets where the value is read: a var() naming one reads it
 * @returns {{message: string, near: string[], close: boolean, fixed?: string} | null}
 */
export function unknownVarRef(v, TOKENS, thing, reads) {
  // A var() whose name is not a custom property (`var(color-x)`, `var(-x)`,
  // `var()`, `var(--)`) makes the whole value invalid: the browser drops
  // it. Named with the repaired form when there is one.
  for (const m of v.matchAll(/var\(\s*([^,)]*?)\s*(?=[,)]|$)/gi)) {
    const raw = m[1];
    // A name after the dashes, as CSS reads one (`--café` included).
    if (
      new RegExp(String.raw`^${CUSTOM_PROPERTY}$`).test(raw) &&
      !raw.startsWith('---')
    )
      continue;
    const bare = raw.replace(/^-+/, '');
    const repaired = /^[a-z0-9][a-z0-9_-]*$/i.test(bare) ? `--${bare}` : null;
    return {
      message: `var(${raw}) is not a CSS variable reference: a variable's name starts with --${repaired ? `, as in var(${repaired})` : ''}, and the browser drops the whole value otherwise.`,
      near: repaired ? [repaired] : [],
      close: Boolean(repaired && repaired in TOKENS),
      ...(repaired
        ? {fixed: v.replace(m[0], m[0].replace(raw, repaired))}
        : {}),
    };
  }
  for (const [ref, name, comma] of v.matchAll(
    new RegExp(String.raw`var\(\s*(${CUSTOM_PROPERTY})\s*(,)?`, 'gi'),
  )) {
    if (name in TOKENS || name.startsWith('--_') || reads?.has(name)) continue;
    // A fallback always gives a value: never "reads nothing" (a likely
    // typo is noted when the setting is made).
    if (comma) continue;
    // A name that differs from a token only in case is that token (as the
    // setting reader reads `--Spacing-4`): an exact reading, never one typo
    // among the family's siblings.
    const folded = Object.keys(TOKENS).find(
      k => k.toLowerCase() === name.toLowerCase(),
    );
    const near = folded
      ? [folded]
      : nearest(name, Object.keys(TOKENS)).filter(n => typoNear(name, n));
    // One token within the one typo limit is that token misspelled: the
    // value with it repaired.
    if (near.length)
      return {
        message: `${name} is not a design token, so var(${name}) would read nothing.`,
        near,
        close: true,
        ...(near.length === 1
          ? {fixed: v.replace(ref, ref.replace(name, near[0]))}
          : {}),
      };
    // Without a fallback, a variable no design token names reads nothing;
    // var(--x, <value>) falls back to the value.
    if (!comma && !DIALS[thing])
      return {
        message: `${name} is not a design token, so var(${name}) would read nothing. Give a fallback (var(${name}, <value>)) for a variable your app sets, or use a design token.`,
        near: nearest(name, Object.keys(TOKENS)).slice(0, 3),
        close: false,
      };
  }
  return null;
}

/**
 * Why a font value names a font file or a link rather than a family
 * (`./fonts/My.woff2`, `Inter.ttf`, `https://fonts.googleapis.com/…`,
 * `url(…)`), or null. A theme names families; a file is loaded with
 * @font-face or a font package.
 * @param {string} value
 * @returns {string | null}
 */
export function fontFileReason(value) {
  // Each family as CSS reads it: an escape (`Gill\ Sans`, `\5FAE`) is part
  // of the name, never a path separator.
  // The families as the one family-list reader splits them (a quoted name
  // with a comma is one family).
  const families = (familiesOf(value) ?? String(value).split(',')).map(f =>
    cssUnescape(f.trim().replace(/^["']|["']$/g, '')),
  );
  const hit = families.find(
    f =>
      /^url\(/i.test(f) ||
      /:\/\//.test(f) ||
      /[\\/]/.test(f) ||
      /\.(woff2?|ttf|otf|eot)$/i.test(f),
  );
  const colon = families.find(f => f.includes(':'));
  if (!hit && colon)
    return `"${colon}" holds a colon, so it is a pasted declaration or a link, not a font family name. Give the family alone, such as Inter, sans-serif.`;
  return hit
    ? `"${hit}" is a font file or a link, not a font family name. A theme names a family (such as Inter); load the file with @font-face in your app's CSS, or install a font package, then set the family it defines.`
    : null;
}

/**
 * A word as a suggested command quotes it, without the quotes.
 * @param {string} word
 */
function unquoteArg(word) {
  const m = /^'(.*)'$/s.exec(word.trim());
  return m ? m[1].replace(/'\\''/g, "'") : word.trim();
}

/** Core's stylesheet text, by project folder. @type {Map<string, string>} */
const coreStyles = new Map();

/**
 * Whether Core's own stylesheet reads a token anywhere (a part the editor
 * does not render, such as the app shell behind the page, included).
 * @param {any} ctx
 * @param {string} token
 */
function coreStylesRead(ctx, token) {
  const cwd = String(ctx?.project?.cwd ?? '');
  let css = coreStyles.get(cwd);
  if (css == null) {
    try {
      css = fs.readFileSync(
        ctx.project.req.resolve('@astryxdesign/core/astryx.css'),
        'utf8',
      );
    } catch {
      css = '';
    }
    coreStyles.set(cwd, css);
  }
  return new RegExp(`var\\(\\s*${token.replace(/[-]/g, '\\-')}\\s*[,)]`).test(
    css,
  );
}
