// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The type check of one `set` or `undo <theme> <thing>`: the part, the variant, the
 * state, the mode, the token's type, and whether the part (or anything in
 * it) reads the token. A change that cannot take effect is refused, and the
 * refusal leads with the command that works.
 *
 * @position api/theme-edit — checks over the part data
 */

import {AstryxError} from '../error.mjs';
import * as fs from 'node:fs';
import * as path from 'node:path';
import {partForWord} from './_how-question.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {baseInstalled, baseThemeFile, installLine} from './_project.mjs';
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
  numbersIn,
  propertyGrammar,
  takesPercentage,
  sameKindValues,
} from './_css.mjs';
import {calcVars, coreFallback, multipliedTokens} from './_parts.mjs';
import {
  MODE_WORDS,
  AUTO_SPREAD,
  COLOR_PROP_PARTS,
  COLOR_PROPS,
  COMMON_STATES,
  CORNERS,
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
  isSystemFamily,
} from './_tables.mjs';
import {
  COLOR_NAMES,
  colorProblem,
  isColorValue,
  isNumber,
  isSafeValue,
  isSize,
  parseColor,
  mixSide,
  splitTop,
} from './_color.mjs';
import {
  PALETTE_DIALS,
  PALETTE_TOKENS,
  VIBRANCY_DEFAULT,
  isGraySeed,
  paletteToken,
  seedOf,
} from './_palette.mjs';
import {
  camel,
  kebab,
  nearest,
  negates,
  partDefault,
  partsOf,
  refuse,
  lengthPx,
  radiusAt,
  radiusTokenOf,
  cornerParts,
  focusStateOf,
  valueProblem,
  partComponentDocs,
  themeFiles,
  ownSourceTokenValues,
  baseTopTokens,
  baseComponent,
  baseComponentReads,
  baseRuleHas,
  partRuleTokens,
  cssFamily,
  familySpaces,
  baseTextPx,
  fontsourcePackageOf,
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
  PROPERTY_WORDS,
  WEIGHT_WORDS,
  TAILWIND_RADIUS,
  documentReadings,
  documentNumericTable,
  documentRange,
  withoutCopyDebris,
  commaNumbers,
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
 * A `set` (or `undo`) command for a setting, with its scope, to suggest.
 * @param {string} slug
 * @param {string} thing
 * @param {string} value
 * @param {{on?: string, when?: string, state?: string, mode?: string, only?: boolean}} s
 * @param {boolean} [unset]
 */
export const setLine = (slug, thing, value, s, unset = false) =>
  `${P} ${unset ? 'undo' : 'set'} ${slug} ${thing}${value ? ` ${quoteCommandArgument(value)}` : ''}${s.on ? ` --on ${s.on}` : ''}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}${s.only ? ' --only' : ''}`;

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
  const lower = String(v).trim().toLowerCase();
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
    .replace(/\s+/g, '')
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
  // rules itself): the value without it.
  /** @type {string} */
  let p = (
    type === 'font' || type === 'font-family'
      ? pastedFont(value) || value
      : pastedDeclaration(value)?.value || typedPlain(value)
  )
    .replace(/;+\s*$/, '')
    .replace(/\s*!\s*important\s*$/i, '')
    .replace(/;+\s*$/, '')
    .trim();
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
    t.replace(/\s+/g, ''),
    t.replace(/^([+-]?\d+),(\d+)/, '$1.$2').replace(/\s+/g, ''),
    mathSpaced(t),
  ];
  const m = /^([+-]?\d*\.?\d+)\s*([a-z%]+)$/i.exec(
    t.replace(/^([+-]?\d+),(\d+)/, '$1.$2'),
  );
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
  const comma = commaNumbers(plain);
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
 * @returns {Array<{setting: import('./_settings.mjs').Setting, why: string, scope?: boolean, fix?: string}>} every saved setting the editor no longer accepts (`fix`: the clean value to set, when one reads)
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
  /** @type {Array<{setting: import('./_settings.mjs').Setting, why: string, scope?: boolean, fix?: string}>} */
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
        !FAMILIES[s.on] &&
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
      if (t && s.state && ![...t.states, ...COMMON_STATES].includes(s.state))
        return scope(`"${s.state}" is not a state of ${s.on}`);
      if (t && s.when) {
        const [prop, value] = String(s.when).split(':');
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
      found.push({setting: s, why: bad.message});
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

/** The theme-wide dial or token for a CSS property typed with no part. */
const WHOLE_THEME_EQUIVALENT = /** @type {Record<string, string>} */ ({
  'border-radius': 'corners',
  'font-size': 'text-size',
  'font-family': 'font',
  color: '--color-text-primary',
  background: '--color-background-body',
  'background-color': '--color-background-body',
});

/** A number or a size, which is never a font family. */
const NUMBERISH = /^[+-]?(\d+\.?\d*|\.\d+)(px|rem|em|pt|%)?$/i;

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
      `"${value}" cannot be a CSS value: it has a ; { } < > or a newline, a comment, !important, or an unclosed bracket or quote.${/!\s*important/i.test(value) ? ' !important is not used: the theme places its own rules.' : ''}`,
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
  const ref = /^var\(\s*(--[a-z0-9-]+)\s*(,.*)?\)$/i.exec(value.trim());
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
  if (type === 'color' && !isFixedColor(value)) bad('a color', null);
  if (type === 'size' && !isSize(value, name)) {
    // The token's own default is never offered as a repair: only a size
    // read from the value typed.
    const sizeExample = null;
    // The size meant, when one dot or sign is all that is wrong (1.px).
    const meant = value.trim().replace(/(\d)\.(?=[a-z%]|$)/gi, '$1');
    // A bare number is the size in px.
    // A bare number is the size in px; a minus sign is dropped.
    const plain = value.trim().replace(/^-(?=\d|\.\d)/, '');
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
    !/^var\(--[a-z0-9-]+\)$/i.test(v0) &&
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
 */
function checkCycle(thing, value, TOKENS, data, cwd, scope = {}) {
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
  /** @param {string} t */
  const globalValue = t =>
    String(
      (Object.hasOwn(own, t) ? own[t] : null) ??
        settings.find(s => s.source === 'token' && s.thing === t && !s.on)
          ?.value ??
        baseTokens.get(t) ??
        TOKENS[t] ??
        '',
    );
  const refs = (/** @type {string} */ v) =>
    [...v.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)].map(m => m[1]);
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
 * The CSS color name nearest a word typed as a color (`banan` is not one,
 * `rd` is red), or null when none is near.
 * @param {string} v
 */
function nearestColorName(v) {
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
      ? {
          takes: 'a value of 0 or more',
          near: v.replace(/(^|[\s(,/])-(?=\.?\d)/g, '$1'),
        }
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
  const joined = v.replace(/(\d)\s+(px|rem|em|%)\b/gi, '$1$2');
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
      // Below the property's range (a negative width): the same, 0 or more.
      (pxFits && withPx && takes(withPx.replace(/(^|[\s/(,])-(?=\.?\d)/g, '$1'))
        ? withPx.replace(/(^|[\s/(,])-(?=\.?\d)/g, '$1')
        : null) ??
      (takes(joined) && joined !== v ? joined : null) ??
      // A comma between digits is a decimal point (1,5rem is 1.5rem), never
      // a split into layers.
      (takes(commaNumbers(v)) && commaNumbers(v) !== v
        ? commaNumbers(v)
        : null) ??
      // Several values of one kind on a property that takes one
      // (padding-top with four lengths): the first as typed, with px only
      // when the property takes no bare number. Never one value of a
      // shorthand of several kinds (`all 200` for transition).
      (() => {
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
const STATE_WORDS = [
  'hover',
  'active',
  'focus',
  'focus-visible',
  'focus-within',
  'disabled',
  'pressed',
  'selected',
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
  return [...new Set([...t.states, ...COMMON_STATES])].filter(
    state => !plain || takes(state),
  );
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
  if (!unset && typeof value === 'string' && DIALS[thing]) {
    const words = new Set(
      String(DIALS[thing].values ?? '')
        .split('|')
        .filter(w => /^[a-z][a-z-]*$/.test(w)),
    );
    const lower = value.trim().toLowerCase();
    // (On the font dial several words are a family list, whose names keep
    // their letters; one word is the preset.)
    const read = thing === 'font' ? [lower] : lower.split(/\s+/);
    if (lower && read.every(w => words.has(w))) value = lower;
  }
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
  // A weight (or a style) after a family (`Inter 600`, `Inter bold
  // italic`) is no family name: the family alone, and the weight where a
  // weight is set.
  const familyWeight =
    !unset &&
    typeof value === 'string' &&
    (thing === 'font' ||
      thing === 'font-family' ||
      thing.startsWith('--font-family'))
      ? /^\s*([A-Za-z][A-Za-z ]*?)\s+(\d{3}|thin|light|regular|medium|semibold|semi-bold|bold|extrabold|heavy|black)(\s+italic)?\s*$/i.exec(
          value,
        )
      : null;
  // A weight word after a family is part of the family's name (Arial
  // Black, Archivo Black, Segoe UI Semibold) unless the whole name is no
  // family the editor knows and the name without it is; a weight number
  // (`Inter 600`) is never part of a name.
  const weightIsName =
    familyWeight != null &&
    !/^\d+$/.test(familyWeight[2]) &&
    !(
      !knownFamily(ctx, `${familyWeight[1].trim()} ${familyWeight[2]}`) &&
      knownFamily(ctx, familyWeight[1].trim())
    );
  if (
    familyWeight &&
    !weightIsName &&
    typeof value === 'string' &&
    !value.includes(',') &&
    // `bold bold` is a weight twice and `italic bold` a style and a
    // weight, read below: no family is named.
    familyWeight[1]
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .some(
        w =>
          HEADING_WEIGHTS[w] === undefined &&
          WEIGHT_WORDS[w] === undefined &&
          !/^(italic|oblique|normal|small-caps)$/.test(w),
      )
  ) {
    const family = familyWeight[1].trim();
    const w = familyWeight[2].toLowerCase().replace('-', '');
    // The headings rung nearest the weight, in any form the weight table
    // reads (ExtraBold is heavy, 900 is heavy).
    const number = /^\d+$/.test(w)
      ? Number(w)
      : HEADING_WEIGHTS[w] !== undefined
        ? Number(HEADING_WEIGHTS[w])
        : WEIGHT_WORDS[w] !== undefined
          ? Number(WEIGHT_WORDS[w])
          : null;
    const word = number != null ? weightRung(number) : null;
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${value.trim()}" puts a weight after the family, so the browser reads one family named that and falls back. ${thing} takes the family (${family}); a weight is set with headings, font-weight or a --font-weight-* token.`,
      {
        run: [
          `${P} set ${slug} ${thing} ${quoteCommandArgument(family)}${flags.on ? ` --on ${flags.on}` : ''}`,
          ...(thing === 'font' && word
            ? [`${P} set ${slug} headings ${word}`]
            : []),
        ],
      },
    );
  }
  // A number or size given as a font family (`--font-family-body 700`,
  // `font-family 16px --on card`) is a weight or a size, never a family.
  if (
    !unset &&
    typeof value === 'string' &&
    (thing === 'font-family' || thing.startsWith('--font-family')) &&
    NUMBERISH.test(value.trim())
  )
    refuse(
      E.ERR_THEME_BAD_VALUE,
      `"${value.trim()}" is a ${/[a-z%]$/i.test(value.trim()) ? 'size' : 'weight'}, not a font family: ${thing} names families (such as Inter, serif). ${/[a-z%]$/i.test(value.trim()) ? 'A text size is set with text-size or a --font-size-* token.' : 'A weight is set with font-weight or a --font-weight-* token.'}`,
      {run: [`${HOW} ${quoteCommandArgument(thing)}`]},
    );
  // A font list with a comma missing before its generic family, or a
  // generic written with a space, on the font dial: the list meant.
  if (!unset && typeof value === 'string' && thing === 'font') {
    const fixed = fontListMeant(value);
    if (fixed)
      refuse(
        E.ERR_THEME_BAD_VALUE,
        `"${value}" names a family that exists nowhere: ${fixed.why}.`,
        {run: [setLine(slug, 'font', fixed.value, flags, false)]},
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
    // Another CSS property's name before a part property's value
    // (`padding 'margin: 8px'`) is that property's value, never this one's.
    if (
      label &&
      partProperty &&
      label.word !== thing &&
      !ownLabel(thing, label.word) &&
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
      const mode = MODE_WORDS[label.word];
      const colorful =
        PALETTE_DIALS.includes(thing) ||
        (thing.startsWith('--') && isColorToken(thing)) ||
        (partProperty &&
          /color|^background$|^fill$|^stroke$|shadow/.test(thing));
      const parts = [...ctx.project.target.keys(), ...Object.keys(FAMILIES)];
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
          ? Boolean(MODE_WORDS[rest.trim().toLowerCase()])
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
        const m = flagWord === 'mode' ? MODE_WORDS[r] : null;
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
            run: [`${P} set ${slug} ${thing} ${q(rest)}${scope}`],
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
  const s = checkSettingAsTyped(ctx, slug, data, thing, value, flags, unset);
  // A var() with a fallback always gives a value; a name one slip from a
  // design token is noted as a likely typo, and the setting stands.
  if (!unset && typeof value === 'string' && !s.note) {
    const typo = fallbackVarTypo(value, ctx.project.core.tokenDefaults ?? {});
    if (typo) s.note = typo;
  }
  return s;
}

/**
 * A note for a var() with a fallback whose name is a letter or two off a
 * design token (`var(--spacing-xl, 2rem)` when the token is `--spacing-x1`):
 * the fallback shows until it is fixed. Null when there is none.
 * @param {string} v
 * @param {Record<string, unknown>} TOKENS
 */
function fallbackVarTypo(v, TOKENS) {
  for (const [, name] of v.matchAll(/var\(\s*(--[a-z0-9-]+)\s*,/gi)) {
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
) {
  const s = checkOne(ctx, slug, data, thing, value, flags, unset);
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
 * @returns {import('./_settings.mjs').Setting}
 */
function checkOne(ctx, slug, data, thing, value, flags, unset) {
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
  // A value pasted over several lines is one value.
  const v = normalValue(thing, value ?? '');
  // A var() that misspells a design token would read nothing.
  if (!unset) {
    const bad = unknownVarRef(v, TOKENS, thing);
    if (bad)
      refuse(E.ERR_THEME_UNKNOWN_TOKEN, bad.message, {
        didYouMean: bad.near,
        run: [
          ...(bad.fixed
            ? [
                `${P} set ${slug} ${thing} ${quoteCommandArgument(bad.fixed)}${/** @type {const} */ (['on', 'state', 'when', 'mode']).map(k => (flags[k] ? ` --${k} ${quoteCommandArgument(String(flags[k]))}` : '')).join('')}`,
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
  if (flags.when) s.when = flags.when.trim();
  // A state in any case or spelling of its words (focusVisible,
  // focus_visible, 'focus visible') is the state, written as CSS writes it.
  if (flags.state)
    s.state = flags.state
      .trim()
      .replace(/^:+/, '')
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/[\s_]+/g, '-')
      .toLowerCase();
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
      // A word for one of the two (night, day) is that one; never the
      // nearest spelling, which can be the other (night → light).
      const meant = {
        night: 'dark',
        nighttime: 'dark',
        dim: 'dark',
        black: 'dark',
        day: 'light',
        daytime: 'light',
        bright: 'light',
        white: 'light',
      }[mode];
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
  if (s.mode && data.mode !== 'both' && !unset && !sameModeEntry) {
    // What takes no --mode in any theme (a size, a font, a keyword) is
    // refused for that, with the command that drops --mode: a theme with
    // both modes would refuse it too, so its mode is no way out.
    try {
      checkSetting(ctx, slug, {...data, mode: 'both'}, thing, v, flags);
    } catch (e) {
      if (/** @type {any} */ (e)?.code === E.ERR_THEME_NO_MODE) throw e;
    }
    refuse(
      E.ERR_THEME_NO_MODE,
      `This theme is ${data.mode}; --mode is for themes with both modes.`,
      {
        run: [
          // For the mode the theme does not show, both modes first; the
          // same setting for the theme's own mode keeps where it applies.
          ...((data.mode === 'light-only' ? 'light' : 'dark') !== s.mode
            ? [`${P} set ${slug} mode both`]
            : []),
          `${P} set ${slug} ${thing} ${quoteCommandArgument(v)}${onFlag}${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}`,
        ],
      },
    );
  }
  if ((s.when || s.state) && !s.on)
    refuse(E.ERR_MISSING_ARGUMENT, '--when and --state need --on <part>.', {
      run: [`${HOW} --list parts`],
    });
  // --only is checked on a part this Core has; a part in other letters or
  // misspelt gets the part's own refusal first, with --only kept.
  if (s.only && (!s.on || TARGET.has(s.on) || FAMILIES[s.on])) {
    const fam = s.on ? familyOf(s.on) : null;
    if (!fam || FAMILIES[/** @type {string} */ (s.on)])
      refuse(
        E.ERR_INVALID_ARGUMENT,
        '--only is for one member of a group, such as text-input (how --list groups).',
        {run: [`${HOW} --list groups`]},
      );
    if (!AUTO_SPREAD.includes(/** @type {string} */ (fam)))
      refuse(
        E.ERR_INVALID_ARGUMENT,
        `${s.on} is styled on its own already: only ${AUTO_SPREAD.join(' and ')} spread to their group, so drop --only.`,
        {
          run: [
            unset
              ? `${P} undo ${slug} ${thing}${v ? ` ${quoteCommandArgument(v)}` : ''} --on ${s.on}`
              : `${P} set ${slug} ${thing} ${quoteCommandArgument(v)} --on ${s.on}`,
          ],
        },
      );
  }
  const isRole = thing === 'font' && FONT_ROLES.includes(s.on ?? '');
  if (s.on && !isRole && !FAMILIES[s.on]) {
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
      // A plain word how reads as a part or group (checkboxes: checks).
      const byWord = partForWord(lower);
      // A plain plural of a part (cards, dialogs, tabs) is that part.
      const singular = [lower, dashed]
        .flatMap(w => [
          w.replace(/ies$/, 'y'),
          w.replace(/(ch|sh|x|s)es$/, '$1'),
          w.replace(/s$/, ''),
        ])
        .find(x => x !== lower && (TARGET.has(x) || FAMILIES[x]));
      // Several parts named in one --on (`button, text-input`, `button/
      // text-input`, `button and text-input`, or spaces): one command per
      // part named, each checked, never a group that one word of the list
      // happens to name.
      const listed = /,|\/|&|\band\b/.test(lower);
      // (Words with only spaces that name one part, `text inputs`, are
      // that part.)
      if (!(TARGET.has(dashed) || FAMILIES[dashed]) && (listed || !singular)) {
        const pieces = lower
          .split(/\s*(?:,|\/|&|\band\b)\s*|\s+/)
          .map(x => x.trim())
          .filter(Boolean);
        const partOf = (/** @type {string} */ w) =>
          TARGET.has(w) || FAMILIES[w]
            ? w
            : ([w.replace(/ies$/, 'y'), w.replace(/s$/, '')].find(
                x => x !== w && (TARGET.has(x) || FAMILIES[x]),
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
        TARGET.has(lower) || FAMILIES[lower]
          ? lower
          : TARGET.has(dashed) || FAMILIES[dashed]
            ? dashed
            : singular
              ? singular
              : byWord && (TARGET.has(byWord) || FAMILIES[byWord])
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
      // A plural or another case names the part it means; a typo of one
      // part leads with the same command on that part.
      const near = nearest(s.on.toLowerCase().replace(/s$/, ''), [
        ...TARGET.keys(),
        ...Object.keys(FAMILIES),
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
      // A prop and value in other letters, with spaces or `=` between
      // (`Variant: Primary`, `variant=primary`): the working command.
      const m = /^\s*([^:=\s]+)\s*[:=]\s*([^:=]+?)\s*$/.exec(s.when);
      if (m) {
        const prop = t.props.find(x => x.toLowerCase() === m[1].toLowerCase());
        const vals = prop ? (C.variantValues(s.on)[prop] ?? []) : [];
        const val = vals.length
          ? vals.find(x => x.toLowerCase() === m[2].toLowerCase())
          : m[2];
        const when = prop && val ? `${prop}:${val}` : null;
        if (when && when !== s.when)
          refuse(
            E.ERR_THEME_UNKNOWN_VARIANT,
            `--when "${s.when}" is written ${when}.`,
            {
              didYouMean: [when],
              run: [setLine(slug, thing, v, {...s, when}, unset)],
            },
          );
      }
      const [p, wv, ...more] = s.when.split(':');
      if (!wv || more.length)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          '--when takes <prop>:<value>, such as variant:primary.',
          {run: [`${HOW} ${s.on}`]},
        );
      if (!t.props.includes(p))
        refuse(
          E.ERR_THEME_UNKNOWN_VARIANT,
          `${s.on} has no prop "${p}". It has: ${t.props.join(', ') || 'none'}.`,
          {didYouMean: nearest(p, t.props), run: [`${HOW} ${s.on}`]},
        );
      const vals = C.variantValues(s.on)[p] ?? [];
      if (vals.length && !vals.includes(wv))
        refuse(
          E.ERR_THEME_UNKNOWN_VARIANT,
          `${s.on} has no ${p} "${wv}". ${p} is one of: ${vals.join(', ')}.`,
          {didYouMean: nearest(wv, vals), run: [`${HOW} ${s.on}`]},
        );
    }
    const states = [...t.states, ...COMMON_STATES];
    // A state the part lists in camelCase (toggle-button's isPressed) typed
    // in any case or with dashes is that state.
    const flat = (/** @type {string} */ x) =>
      x.replace(/[-_\s]/g, '').toLowerCase();
    if (s.state && !states.includes(s.state)) {
      const same = states.find(x => flat(x) === flat(String(s.state)));
      if (same) s.state = same;
    }
    // Other words for a state, mapped to the one the part has; with none
    // near, the list of its states (never a guess such as hover).
    const SYNONYMS = wordTable(
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
    const meant =
      (SYNONYMS[String(s.state ?? '').toLowerCase()] ?? []).find(x =>
        states.includes(x),
      ) ?? nearest(String(s.state ?? ''), states)[0];
    if (s.state && !states.includes(s.state))
      refuse(
        E.ERR_THEME_UNKNOWN_STATE,
        `"${s.state}" is not a state of ${s.on}. States: ${settableStates(ctx, slug, data, s.on).join(', ') || 'none'}.`,
        {
          ...(meant ? {didYouMean: [meant]} : {}),
          run: [
            meant
              ? setLine(slug, thing, v, {...s, state: meant}, unset)
              : `${HOW} ${quoteCommandArgument(s.on)}`,
          ],
        },
      );
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
          run: [
            within && !bare && /^focus/.test(s.state)
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
  if (s.on && FAMILIES[s.on] && (s.when || s.state)) {
    const members =
      /** @type {Array<[string, import('../../foundation/discovery/theming-targets.mjs').ThemingTarget]>} */ (
        FAMILIES[s.on].map(m => [m, TARGET.get(m)]).filter(([, t]) => t)
      );
    if (s.when) {
      const [p, wv, ...more] = s.when.split(':');
      const fits = members.some(([m, t]) => {
        if (!wv || more.length || !t.props.includes(p)) return false;
        const vals = C.variantValues(m)[p] ?? [];
        return !vals.length || vals.includes(wv);
      });
      if (!fits)
        refuse(
          E.ERR_THEME_UNKNOWN_VARIANT,
          `No member of the ${s.on} group has ${s.when}.`,
          {run: [`${HOW} ${s.on}`]},
        );
    }
    const state = s.state;
    if (
      state &&
      !members.some(([, t]) => [...t.states, ...COMMON_STATES].includes(state))
    )
      refuse(
        E.ERR_THEME_UNKNOWN_STATE,
        `"${s.state}" is not a state of any member of the ${s.on} group.`,
        {run: [`${HOW} ${s.on}`]},
      );
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
            : nearest(lower, ok);
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
                  ? [`${P} set ${slug} ${thing} ${near[0]}`]
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
        const words = String(v ?? '')
          .trim()
          .toLowerCase()
          .split(/[\s,]+/)
          .filter(Boolean)
          .map(w => MORE[w] ?? w);
        const known = (/** @type {string} */ w) =>
          HEADING_WEIGHTS[w] !== undefined || HEADING_TRACKING[w] !== undefined;
        if (
          (words.length > 1 || MORE[String(v).trim().toLowerCase()]) &&
          words.every(known)
        )
          refuse(
            E.ERR_THEME_BAD_VALUE,
            words.length > 1
              ? `"${v}" is ${words.length} headings values; headings takes one at a time (a weight and a tracking are two settings).`
              : `"${v}" is the weight ${words[0]}.`,
            {run: words.map(w => `${P} set ${slug} headings ${w}`)},
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
        const meant =
          words.find(w => w === lower) ??
          (weight != null ? weightRung(weight) : nearest(lower, words)[0]);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `headings takes ${DIALS.headings.values}, not "${v}".${weight != null && meant ? ` ${meant} sets weight ${HEADING_WEIGHTS[meant]}.` : ''}`,
          {
            didYouMean: meant ? [meant] : [],
            run: meant
              ? [setLine(slug, 'headings', meant, s)]
              : [`${HOW} headings`],
          },
        );
      }
      return s;
    }
    if (unset) return s;
    /** @param {Array<[string, number]>} L @param {string | number} def */
    const ladder = (L, def) => {
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
      const cur =
        shown?.value ??
        // A part's own radius (a number) already counts a whole-theme
        // setting.
        (s.on && typeof def !== 'number' ? own('') : undefined) ??
        def;
      const at = L.findIndex(([n]) => n === cur);
      const stepped = at + (v === 'more' ? 1 : -1);
      if (at >= 0 && stepped >= 0 && stepped < L.length) return L[stepped][0];
      // At the last rung that way, a step goes nowhere: refused as every
      // dial refuses it at its end, with the other way.
      if (at >= 0)
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${thing} is already at its ${v === 'more' ? 'largest' : 'smallest'} step, ${L[at][0]}${s.on ? ` on ${s.on}` : ''}, so "${v}" has nowhere to go.`,
          {run: [setLine(slug, thing, v === 'more' ? 'less' : 'more', s)]},
        );
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
      if (s.on) refuseInvisibleCorners(ctx, slug, s, data);
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
        const whole = [...data.settings]
          .reverse()
          .find(x => x.thing === 'corners' && !x.on);
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
            : onPart
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
        const rungs = CORNERS.map(
          ([n]) => /** @type {const} */ ([n, radiusAt(base, n, token)]),
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
        // rem is that many 16px, saved in px.
        const pxLen = /\d(px|rem)$/.test(lower) ? lengthPx(lower) : null;
        if (CORNERS.some(([n]) => n === lower)) s.value = lower;
        else if (pxLen != null && pxLen >= 0) {
          s.value =
            pxLen >= 1000 ? 'pill' : `${Math.round(pxLen * 10000) / 10000}px`;
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
          const len =
            calcPx != null && Number.isFinite(calcPx)
              ? calcPx
              : bareNumber
                ? null
                : lengthPx(lower);
          const pct = /^(\d+(?:\.\d+)?)%$/.exec(lower);
          // Tailwind's names, and rounding said with a negation: what they
          // mean (rounded-none and not round are square, rounded-full is
          // pill, rounded-[12px] is 12px).
          const tw = /^rounded-\[(.+)\]$/.exec(lower)?.[1];
          const opposite =
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
            `corners takes ${DIALS.corners.values}, not "${v}"${bareNumber ? ' (a number needs its unit: px or rem)' : ''}.`,
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
      const factor = /^x?(\d*\.?\d+)(%)?$/i.exec(v);
      const nearFactor = factor
        ? SPACING.reduce((a, b) =>
            Math.abs(b[1] - Number(factor[1]) / (factor[2] ? 100 : 1)) <
            Math.abs(a[1] - Number(factor[1]) / (factor[2] ? 100 : 1))
              ? b
              : a,
          )[0]
        : null;
      if (step) s.value = ladder(SPACING, 'medium');
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
        s.value = ladder(TEXT_SIZE, ctx.base ? baseTextPx(ctx.base) : 'medium');
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
          `text-size takes ${DIALS['text-size'].values} (a number is the body size in pixels, 10 to 32), not "${v}".`,
          (() => {
            // A rung in other letter case (Medium) or with px is that rung;
            // a CSS size keyword (x-large) is the size CSS gives it.
            const keyword = CSS_SIZE_KEYWORDS[v.trim().toLowerCase()];
            if (keyword != null && keyword >= 10 && keyword <= 32)
              return {run: [`${P} set ${slug} text-size ${keyword}`]};
            const near =
              TEXT_SIZE.find(([n]) => n === v.trim().toLowerCase())?.[0] ??
              nearest(
                v.trim().toLowerCase(),
                TEXT_SIZE.map(([n]) => n),
              )[0];
            return near
              ? {
                  didYouMean: [near],
                  run: [`${P} set ${slug} text-size ${near}`],
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
                      : textSizePx(v);
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
      // With no color to saturate, no vibrancy value is suggested.
      const canApply = colors.some(x => !isGraySeed(seedOf(x.value)));
      if (!step && canApply && (!/^\d{1,3}$/.test(v) || Number(v) > 100)) {
        // The value meant: a step in other letters (MORE), or the number
        // read as CSS reads it (70%, 7e1), kept in range.
        // Quotes around it (`"50"`) are not part of it.
        const bare = v
          .trim()
          .replace(/^(["'])(.*)\1$/, '$2')
          .trim();
        const word = bare.toLowerCase();
        const n = cssNumber(bare);
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
            ? 'vibrancy sets how saturated the generated colors are, and every color this theme sets is a gray, so it would change nothing. Set a color first.'
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
                `${P} set ${slug} font-family ${quoteCommandArgument(v)} --on ${s.on}`,
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
      if (
        !s.value ||
        /[;{}<>\\\n]/.test(s.value) ||
        !s.value.split(',').every(f => family(f.trim()))
      )
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `"${v}" is not a font: give a preset (${DIALS.font.values}) or a family list such as "Inter, sans-serif".`,
          {run: [`${P} set ${slug} font inter`]},
        );
    } else if (thing === 'base') {
      if (s.on)
        refuse(
          E.ERR_THEME_BAD_VALUE,
          'base applies to the whole theme; drop --on.',
          {run: [`${P} set ${slug} base ${quoteCommandArgument(v)}`]},
        );
      if (![...LIKE, 'none'].includes(v)) {
        // `NEUTRAL`, `base=neutral`, `None`: the base meant.
        const meant = v
          .toLowerCase()
          .replace(/^base\s*[=:]\s*/, '')
          .trim()
          .replace(/^@astryxdesign\/theme-/, '')
          .replace(/^theme-/, '');
        // Only a base this project has installed is suggested; a theme
        // made here is never a base.
        const bases = [
          ...LIKE.filter(b => baseInstalled(ctx.project, b)),
          'none',
        ];
        // The base named in other letters is the one meant; a guess is
        // only among installed bases.
        const near =
          bases.includes(meant) || LIKE.includes(meant)
            ? [meant]
            : nearest(meant, bases);
        // A built-in base named that is not installed: install it, then the
        // same set.
        const install =
          LIKE.includes(meant) && !baseInstalled(ctx.project, meant)
            ? [installLine(ctx.project.cwd, [`@astryxdesign/theme-${meant}`])]
            : [];
        const madeHere = fs.existsSync(themeFiles(ctx.project.cwd, v).settings);
        refuse(
          E.ERR_THEME_BAD_VALUE,
          `base takes ${DIALS.base.values}, not "${v}".${madeHere ? ` ${v} is a theme made here, and a theme builds only on a built-in one.` : ''}`,
          {
            didYouMean: near,
            // With nothing near, every base that works here, none first.
            run: near[0]
              ? [...install, `${P} set ${slug} base ${near[0]}`]
              : [
                  'none',
                  ...LIKE.filter(b => baseInstalled(ctx.project, b)),
                ].map(b => `${P} set ${slug} base ${b}`),
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
        const meant =
          DIAL_WORDS.mode[lower] ??
          (['both', 'light-only', 'dark-only'].includes(lower) ? lower : null);
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
      refuse(
        E.ERR_THEME_UNKNOWN_TOKEN,
        `"${thing}" is not a design token.${aliased ? ` The token for that role is ${aliased}.` : ''}`,
        {
          didYouMean: aliased ? [aliased] : nearest(thing, Object.keys(TOKENS)),
          run: [
            ...(aliased ? [setLine(slug, aliased, v, s, unset)] : []),
            listed,
          ],
        },
      );
    }
    const type = C.typeOf(thing);
    // Only colors differ by mode: a shadow list cannot sit inside
    // light-dark(), so a shadow per mode would remove it in both.
    // undo still removes a setting an earlier release saved for one mode.
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
    checkCycle(thing, v, TOKENS, data, ctx.project.cwd, s);
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
              : C.checkTokenOn(slug, t, thing, v, P),
          ]),
      );
      const recorded = results.filter(([, r]) => !r?.soft);
      const hard = recorded.filter(([, r]) => r);
      const spread = Boolean(
        FAMILIES[s.on ?? ''] || (familyOf(s.on ?? '') && parts.length > 1),
      );
      // A part with no record is judged by its group: refused when no
      // member that has a record reads the token, as the group form is.
      const fam = s.on ? familyOf(s.on) : null;
      if (!recorded.length && fam && !spread) {
        const siblings = FAMILIES[fam].filter(t => C.MAP[t]);
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
  const prop = kebab(thing);
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
          // The theme-wide dial or token for it, when there is one; never
          // a part that was not named.
          run: [
            ...(v && WHOLE_THEME_EQUIVALENT[prop]
              ? [
                  `${P} set ${slug} ${WHOLE_THEME_EQUIVALENT[prop]} ${quoteCommandArgument(v)}`,
                ]
              : []),
            `${HOW} ${quoteCommandArgument(prop)}`,
          ],
        },
      );
    s.source = 'property';
    s.thing = prop;
    if (unset) return s;
    // A length property (padding, a corner radius, a gap) that reads a
    // design token of another kind (a color, a font, a duration) gets
    // nothing the browser keeps: refused like the token form.
    if (matchValue(prop, '1px') && !matchValue(prop, 'red'))
      for (const m of v.matchAll(/var\(\s*(--[a-z0-9-]+)/gi)) {
        const kind = ctx.C.isToken(m[1]) ? ctx.C.typeOf(m[1]) : null;
        if (kind && !['size', 'number', 'other'].includes(kind)) {
          const like = /radius/.test(prop)
            ? 'var(--radius-container)'
            : /^(padding|margin|gap|row-gap|column-gap|inset)/.test(prop)
              ? 'var(--spacing-4)'
              : exampleOf('size', prop);
          refuse(
            E.ERR_THEME_BAD_VALUE,
            `${prop} takes a length; ${m[1]} is a ${kind}, so the browser would drop it.`,
            {
              run: [
                `${P} set ${slug} ${prop} ${quoteCommandArgument(v.replace(new RegExp(`var\\(\\s*${m[1]}\\s*(,[^)]*)?\\)`, 'i'), like))} --on ${quoteCommandArgument(String(s.on))}${s.state ? ` --state ${s.state}` : ''}${s.when ? ` --when ${quoteCommandArgument(s.when)}` : ''}${s.mode ? ` --mode ${s.mode}` : ''}`,
                `${HOW} --list tokens ${/radius/.test(prop) ? 'radius' : 'spacing'}`,
              ],
            },
          );
        }
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
      if (hit && !oneLength(v)) {
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
    // A state Core paints at run time with an inline style (a selected table
    // row's wash) outranks any theme rule for that property while Core paints
    // it: the token the inline style reads is what changes it. A component
    // option can turn that paint off (a table without its row highlight), and
    // then a rule in the state applies; the refusal says both.
    if (s.state && !unset) {
      const family =
        prop === 'background' || prop === 'background-color'
          ? 'background-color'
          : prop;
      const inline = partsOf(ctx, s)
        .map(t => [t, ctx.C.MAP[t]?.inline?.[s.state ?? '']?.[family]])
        .find(([, tok]) => tok);
      if (inline)
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `By default Core paints ${inline[0]}'s ${family} when ${s.state} as an inline style from ${inline[1]}, which no theme rule can replace, so set ${inline[1]} on ${inline[0]} when ${s.state} instead; only where the component is set not to paint it (such as a table with its row highlight off) does a ${s.state} ${family} apply, and there ${inline[1]} paints nothing.`,
          {
            run: [
              `${P} set ${slug} ${inline[1]} ${quoteCommandArgument(v)} --on ${inline[0]} --state ${s.state}${s.mode ? ` --mode ${s.mode}` : ''}`,
            ],
          },
        );
    }
    // Text, headings and links take their color from the color prop.
    const textParts = COLOR_PROP_PARTS;
    // A heading's color is written as the text color tokens its color prop
    // reads, on the heading alone (compileTheme), so it shows.
    const headingColor =
      prop === 'color' &&
      partsOf(ctx, s).length > 0 &&
      partsOf(ctx, s).every(t => t === 'heading');
    if (
      !headingColor &&
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
        refuse(
          E.ERR_THEME_NO_EFFECT,
          `${s.on} takes its color from the color prop, which Core sets after part styles, so a color set on ${s.on} never shows. Set the text color token instead.`,
          {
            run: [
              `${P} set ${slug} --color-text-${named ?? 'primary'} ${quoteCommandArgument(color)}${s.mode ? ` --mode ${s.mode}` : ''}`,
              ...(named
                ? []
                : [
                    `${P} set ${slug} --color-text-secondary ${quoteCommandArgument(color)}${s.mode ? ` --mode ${s.mode}` : ''}`,
                  ]),
            ],
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
        `"${v}" cannot be a CSS value: it has a ; { } < > or a newline, a comment, !important, or an unclosed bracket or quote.`,
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
    if (
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
      // A color mixed into the value (a border's) can go per mode on its
      // own; a value with none (a radius) is just set for both modes.
      const hasColor = /#[0-9a-f]{3,8}\b|rgba?\(|hsla?\(/i.test(v);
      // A gradient's colors sit in its image, above any background-color:
      // no color step can make them differ per mode.
      const alt =
        !hasColor || /gradient\(/i.test(v)
          ? null
          : prop === 'border' || prop.startsWith('border-')
            ? 'border-color'
            : prop === 'background'
              ? 'background-color'
              : null;
      // On a part whose variants each have their own color, the color per
      // mode is set for one variant at a time (as that refusal says): the
      // step names the default one, or the first.
      let altWhen = '';
      if (alt && !s.when) {
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
      refuse(
        E.ERR_THEME_NO_MODE,
        `--mode works on plain colors; ${prop} ${prop === 'box-shadow' || prop === 'border' ? 'mixes a color with sizes' : 'is not a color'}, so it cannot differ between light and dark.`,
        {
          run: alt
            ? [
                `${P} set ${slug} ${prop} ${quoteCommandArgument(v.replace(/#[0-9a-f]{3,8}|rgba?\([^)]*\)/i, 'currentcolor'))} --on ${s.on}${whenFlag}   # the shape, both modes`,
                `${P} set ${slug} ${alt} ${quoteCommandArgument(/#[0-9a-f]{3,8}\b|rgba?\([^)]*\)|hsla?\([^)]*\)/i.exec(v)?.[0] ?? '#1f2937')} --on ${s.on}${altWhen}${whenFlag} --mode ${s.mode}   # then the color per mode${altWhen ? ', for each variant' : ''}`,
              ]
            : [
                `${P} set ${slug} ${prop} ${quoteCommandArgument(v)} --on ${s.on}${whenFlag}   # both modes`,
              ],
        },
      );
    }
    // In a state, the other mode keeps the state's own value there (or a
    // value set for both modes); with none to keep, the setting would
    // change that mode too. Without a state, the other mode keeps the
    // part's plain color.
    /** Whether a part keeps a value of its own in the other mode. */
    const keepsOther = (/** @type {string} */ t) =>
      Boolean(partDefault(ctx, t, camel(prop), s.when, s.state)) ||
      // The base theme's own value there (in the state, else at rest) is
      // what the other mode keeps.
      [`:${s.state}`, null].some(st =>
        baseRuleHas(
          ctx.project.cwd,
          data.like,
          t,
          s.when ?? 'base',
          st,
          camel(prop),
        ),
      );
    const cannotKeep =
      s.mode && s.state ? partsOf(ctx, s).filter(t => !keepsOther(t)) : [];
    if (
      cannotKeep.length &&
      !data.settings.some(
        x =>
          x.thing === prop &&
          x.on === s.on &&
          x.when === s.when &&
          x.state === s.state &&
          x.mode !== s.mode,
      )
    ) {
      const flagsTail = `${s.when ? ` --when ${s.when}` : ''}${s.state ? ` --state ${s.state}` : ''}`;
      // The part named keeps its own when only other members of its group
      // cannot: --only writes it alone, its mode kept.
      const onlyThis =
        s.on &&
        !cannotKeep.includes(s.on) &&
        familyOf(s.on) &&
        AUTO_SPREAD.includes(/** @type {string} */ (familyOf(s.on)));
      refuse(
        E.ERR_THEME_NO_MODE,
        `${cannotKeep.slice(0, 3).join(', ')}${cannotKeep.length > 3 ? ` and ${cannotKeep.length - 3} more` : ''} ${cannotKeep.length > 1 ? 'have' : 'has'} no ${prop}${s.state ? ` when ${s.state}` : ''}${s.when ? ` for ${s.when}` : ''} of ${cannotKeep.length > 1 ? 'their' : 'its'} own for the ${s.mode === 'light' ? 'dark' : 'light'} mode to keep, so a ${s.mode}-only value would change it too.${onlyThis ? ` ${s.on} has one: set it alone with --only.` : ' Set it for both modes.'}`,
        {
          run: [
            ...(onlyThis
              ? [
                  `${P} set ${slug} ${prop} ${quoteCommandArgument(v)} --on ${s.on} --only${flagsTail} --mode ${s.mode}`,
                ]
              : []),
            `${P} set ${slug} ${prop} ${quoteCommandArgument(v)} --on ${s.on}${flagsTail}`,
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
            : `${P} set ${slug} ${meant} ${quoteCommandArgument(v || exampleOf(groupOfPropType(meant), meant))}${onFlag || ' --on card'}`,
        ],
      },
    );
  const hint =
    /** @type {((v: string, on: string | undefined) => string[]) | undefined} */ (
      THING_HINTS[thing.toLowerCase()]
    );
  // A dial by another name or case: Accent, gray, saturation, error.
  const lower = thing.toLowerCase();
  const aliases = DIALS[lower] ? [lower] : (COLOR_DIAL_WORDS.get(lower) ?? []);
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
          [`${HOW} --list properties`, `${HOW} --list dials`],
      didYouMean: hint
        ? []
        : nearest(prop, [...Object.keys(DIALS), ...cssProperties()]),
    },
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
    `${s.on} has no background, border or shadow of its own, so rounding its corners changes nothing you see.${kids.length ? ` Parts inside it that do show an edge: ${kids.join(', ')}.` : ''}`,
    {
      run: kids.length
        ? kids.map(k =>
            setLine(slug, 'corners', s.value || 'round', {...s, on: k}),
          )
        : [`${HOW} ${s.on}`],
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
 * The first var() in a value that names no design token and would read
 * nothing (no fallback), or one a letter or two off a token, else null.
 * Dials take their own words, so a dial's var() with no near token passes.
 * @param {string} v
 * @param {Record<string, unknown>} TOKENS
 * @param {string} thing
 * @returns {{message: string, near: string[], close: boolean, fixed?: string} | null}
 */
export function unknownVarRef(v, TOKENS, thing) {
  // A var() whose name is not a custom property (`var(color-x)`, `var(-x)`,
  // `var()`, `var(--)`) makes the whole value invalid: the browser drops
  // it. Named with the repaired form when there is one.
  for (const m of v.matchAll(/var\(\s*([^,)]*?)\s*(?=[,)]|$)/gi)) {
    const raw = m[1];
    if (/^--[a-z0-9_][a-z0-9_-]*$/i.test(raw)) continue;
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
  for (const [, name, comma] of v.matchAll(/var\(\s*(--[a-z0-9-]+)\s*(,)?/gi)) {
    if (name in TOKENS || name.startsWith('--_')) continue;
    // A fallback always gives a value: never "reads nothing" (a likely
    // typo is noted when the setting is made).
    if (comma) continue;
    const near = nearest(name, Object.keys(TOKENS)).filter(n =>
      typoNear(name, n),
    );
    if (near.length)
      return {
        message: `${name} is not a design token, so var(${name}) would read nothing.`,
        near,
        close: true,
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
  const hit = String(value)
    .split(',')
    .map(f => f.trim().replace(/^["']|["']$/g, ''))
    .find(
      f =>
        /^url\(/i.test(f) ||
        /:\/\//.test(f) ||
        /[\\/]/.test(f) ||
        /\.(woff2?|ttf|otf|eot)$/i.test(f),
    );
  const colon = String(value)
    .split(',')
    .map(f => f.trim().replace(/^["']|["']$/g, ''))
    .find(f => f.includes(':'));
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
