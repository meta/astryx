// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Color checks for `astryx experimental theme`: say why a value cannot
 * seed a color, the contrast ratio (on the palette code's luminance), and
 * value type checks. Reading a CSS color to RGB is the shared color reader's
 * (foundation/color/css-color.mjs). The theme's colors themselves come from
 * the palette generator.
 * @position api/theme-edit — pure helpers
 */

import {
  MATH_FUNCTION,
  cssNumber,
  keywordsOf,
  matchType,
  splitTop,
} from './_css.mjs';
import {
  COLOR_SPACES,
  FIXED,
  FUNCTIONS,
  KEYWORDS,
  MIX_SPACES,
  NAMED,
  SYSTEM,
  hex,
  mixColor,
  mixSide,
  readColor,
} from '../../foundation/color/css-color.mjs';
import {luminance} from '../theme/palette/generate/color.mjs';

export {splitTop};
export {
  COLOR_IN_VALUE,
  COLOR_NAMES,
  alphaOf,
  colorsIn,
  compositeOver,
  hex,
  isClipped,
  mixSide,
  namedColorHex,
  oklabDistance,
  oklabOf,
  parseColor,
} from '../../foundation/color/css-color.mjs';

/** @typedef {[number, number, number]} Rgb */

/**
 * A comma (legacy) rgb() or hsl() that CSS does not take as written, in the
 * space-separated syntax CSS reads the same channels in (`hsl(0, 100, 50)`
 * is `hsl(0 100 50)`); null for any other value.
 * @param {unknown} value
 * @returns {string | null}
 */
export function colorAsCssReads(value) {
  const s = String(value ?? '').trim();
  const fn = /^(rgba?|hsla?)\((.*)\)$/i.exec(s);
  if (!fn || !fn[2].includes(',') || readColor(s)) return null;
  const parts = fn[2].split(',').map(x => x.trim());
  if (parts.length !== 3 && parts.length !== 4) return null;
  const name = fn[1].toLowerCase().replace(/a$/, '');
  const modern = `${name}(${parts.slice(0, 3).join(' ')}${parts[3] ? ` / ${parts[3]}` : ''})`;
  return readColor(modern) ? modern : null;
}

/**
 * Why a value cannot seed a color dial, or null when it is one fixed,
 * opaque color: `opaque` is the color without its alpha, for a suggestion.
 * @param {unknown} value
 * @returns {{kind: 'system' | 'space' | 'malformed' | 'unfixed' | 'translucent' | 'unknown', message: string, opaque?: string} | null}
 */
export function colorProblem(value) {
  const s = String(value ?? '').trim();
  const read = readColor(s);
  if (read && read.alpha >= 1) return null;
  if (read)
    return {
      kind: 'translucent',
      message: `is ${Math.round(read.alpha * 1000) / 1000 >= 1 ? 'not fully opaque' : `see-through (opacity ${Math.round(read.alpha * 1000) / 1000})`}, and a color needs to be opaque to generate shades from`,
      opaque: hex(read.rgb),
    };
  const lower = s.toLowerCase();
  if (SYSTEM.includes(lower))
    return {
      kind: 'system',
      message:
        "is a system color: it follows the user's device, so no shades can be generated from it. Give a fixed color",
    };
  const fn = /^([a-z-]+)\((.*)\)$/i.exec(s);
  if (fn && fn[1].toLowerCase() === 'color') {
    const space = /^\s*([a-z0-9-]+)\s/i.exec(fn[2])?.[1].toLowerCase();
    if (
      space &&
      !COLOR_SPACES.includes(space) &&
      !/var\(|calc\(|\bfrom\b/i.test(fn[2])
    )
      return {
        kind: 'space',
        message: `uses the ${space} color space, and color() is read in ${COLOR_SPACES.join(', ')} only`,
      };
  }
  if (fn && FIXED.test(fn[1]) && !/var\(|calc\(|env\(|\bfrom\b/i.test(fn[2]))
    return {kind: 'malformed', message: 'is not a valid CSS color'};
  // A mix this reader cannot work out (another space, a color with no
  // fixed value) says so, rather than calling the mix unfixed.
  if (
    fn &&
    fn[1].toLowerCase() === 'color-mix' &&
    !/var\(|env\(/i.test(fn[2])
  ) {
    // The shares, beside each color (a color's own percentages aside).
    const [space, ...sides] = splitTop(fn[2], ',').map(x => x.trim());
    const parts = sides.map(mixSide);
    if (parts.some(x => x.pct != null && (x.pct < 0 || x.pct > 100)))
      return {
        kind: 'malformed',
        message:
          'has a color-mix() share outside 0% to 100%, which CSS does not take',
        ...(() => {
          const near = mixColor(
            [
              space,
              ...parts.map(x =>
                x.pct == null
                  ? x.color
                  : `${x.color} ${Math.max(0, Math.min(100, x.pct))}%`,
              ),
            ].join(', '),
          );
          return near ? {opaque: hex(near.rgb)} : {};
        })(),
      };
    const near = mixColor(fn[2], true);
    return {
      kind: 'unfixed',
      message: `is a color-mix() this editor does not work out (it mixes in ${MIX_SPACES.join(', ')}, from colors with fixed values)${near ? `; mixed in oklab it is about ${hex(near.rgb)}` : ''}: give the mixed color itself`,
      ...(near ? {opaque: hex(near.rgb)} : {}),
    };
  }
  // A relative color that changes its channels is not worked out here.
  const rel =
    fn && /^from\s+(.+?)\s+\S+\s+\S+\s+\S+(\s*\/.*)?$/i.exec(fn[2].trim());
  if (rel && !/var\(|env\(/i.test(fn?.[2] ?? '')) {
    const origin = readColor(rel[1]);
    return {
      kind: 'unfixed',
      message: `is a relative color that changes its channels, which this editor does not work out${origin ? ` (it starts from ${hex(origin.rgb)})` : ''}: give the color itself`,
      ...(origin ? {opaque: hex(origin.rgb)} : {}),
    };
  }
  if (isColorValue(s))
    return {
      kind: 'unfixed',
      message: 'has no fixed color, so no shades can be generated from it',
    };
  return {kind: 'unknown', message: 'is not a CSS color'};
}

/**
 * The WCAG contrast ratio of two colors.
 * @param {number[]} a
 * @param {number[]} b
 */
export function ratio(a, b) {
  const [x, y] = [luminance(hex(a)), luminance(hex(b))].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * A value that is one var() of a custom property and nothing else, with
 * any spaces inside its brackets as CSS reads them (`var( --x )`).
 */
export const LONE_VAR = /^var\(\s*--[a-z0-9-]+\s*\)$/i;

/** A var() of a custom property with a fallback: the fallback, captured. */
const VAR_FALLBACK = /^var\(\s*--[a-z0-9-]+\s*,\s*(.+)\)$/i;

/**
 * Whether a value is one CSS color: a hex, a color function, a named or
 * system color, a color keyword, or a variable. A function with plain
 * numbers must be well formed; one with `var()`, `calc()`, `env()` or a
 * relative color is taken as written.
 * @param {unknown} v
 * @returns {boolean}
 */
export const isColorValue = v => {
  const s = String(v).trim();
  const fn = /^([a-z-]+)\((.*)\)$/i.exec(s);
  if (fn && FIXED.test(fn[1]) && !/var\(|calc\(|env\(|\bfrom\b/i.test(fn[2]))
    return (
      readColor(s) != null ||
      (fn[1].toLowerCase() === 'color' &&
        !COLOR_SPACES.includes(
          /^\s*([a-z0-9-]+)\s/i.exec(fn[2])?.[1].toLowerCase() ?? '',
        ) &&
        /^\s*[a-z0-9-]+(\s+\S+){3}(\s*\/\s*\S+)?\s*$/i.test(fn[2]))
    );
  return (
    /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) ||
    FUNCTIONS.test(s) ||
    LONE_VAR.test(s) ||
    // A variable with a color to fall back to.
    (VAR_FALLBACK.test(s) &&
      isColorValue(/** @type {string} */ (VAR_FALLBACK.exec(s)?.[1]))) ||
    Object.hasOwn(NAMED, s.toLowerCase()) ||
    KEYWORDS.includes(s.toLowerCase()) ||
    SYSTEM.includes(s.toLowerCase())
  );
};

/**
 * Whether a value reads as one CSS size for the token: a length in any CSS
 * unit, 0, a variable, env(), or calc()/min()/max()/clamp() with a length
 * inside; below zero only where the property takes it (an offset).
 * @param {unknown} v
 * @param {string} [name]
 */
export const isSize = (v, name = '') => {
  const s = String(v).trim();
  if (s === '0') return true;
  // One length or percentage, read as CSS reads it (+4px, 4e+1px; never
  // 1.px). Only a property that takes a negative length gets one: an
  // offset, a letter spacing, an indent.
  const n = cssNumber(s);
  if (n && n.unit && matchType('length-percentage', s) != null)
    return n.value >= 0 || /offset|tracking|letter-spacing|indent/.test(name);
  if (LONE_VAR.test(s)) return true;
  if (/^env\([a-z-]+(,.*)?\)$/i.test(s)) return true;
  return MATH_FUNCTION.test(s) && matchType('length-percentage', s) != null;
};

/**
 * Whether a value reads as a CSS number for the token: a weight is 1 to
 * 1000 or a weight keyword; a line height is a number, length or
 * percentage of 0 or more, or `normal`.
 * @param {unknown} v
 * @param {string} [name]
 */
export const isNumber = (v, name = '') => {
  const s = String(v).trim();
  if (LONE_VAR.test(s)) return true;
  const n = cssNumber(s);
  // A weight: a font-weight keyword, or a number from 1 to 1000.
  if (/weight/.test(name))
    return (
      keywordsOf('font-weight').includes(s.toLowerCase()) ||
      (n?.unit === '' && n.value >= 1 && n.value <= 1000) ||
      (MATH_FUNCTION.test(s) && matchType('number', s) != null)
    );
  if (/leading|line-height/.test(name))
    return (
      s === 'normal' ||
      (n != null &&
        ['', 'px', 'rem', 'em', '%'].includes(n.unit) &&
        n.value >= 0) ||
      (MATH_FUNCTION.test(s) && matchType('length-percentage', s) != null) ||
      (MATH_FUNCTION.test(s) && matchType('number', s) != null)
    );
  return n?.unit === '';
};

/**
 * A value with each CSS escape (`Gill\ Sans`, `\5FAE`) as one plain
 * character, as CSS reads it: an escape is part of a name, never a
 * boundary. A backslash that escapes nothing (at the end, or before a line
 * break) could join the next declaration, so it stays.
 * @param {string} v
 */
export function withoutCssEscapes(v) {
  return v.replace(/\\(?:[0-9a-fA-F]{1,6}[ \t]?|[^\n\r\f0-9a-fA-F])/g, 'x');
}

/** What a value isSafeValue refuses holds, for the refusal's words. */
export const UNSAFE_VALUE =
  'it has a ; { } < > or a newline, a comment, !important, an unclosed bracket or quote, or an old browser hack (\\9, \\0) at its end';

/**
 * Whether a value can sit in a CSS declaration as it is: no `<>`, control
 * character, comment or `!important` anywhere; outside a quoted string or a
 * `url(data:…)`, no `;{}`; brackets and quotes closed; no old browser hack's
 * escape at its end (`8px\9`: a browser reads it as part of the last word
 * and drops the value). So `content: "a;b"` and a base64 data URL are
 * values, and nothing can end the declaration.
 * @param {string} v
 */
export function isSafeValue(v) {
  if (/\\[09]\s*$/.test(v)) return false;
  // A shell comment ("# direct"), as a command run without a shell passes
  // it, is a comment too.
  // `</` (a closing tag), control characters, comments and !important are
  // refused anywhere; < and > only outside a quoted string.
  // A tab is white space, as CSS reads it.
  if (
    // eslint-disable-next-line no-control-regex
    /<\/|[\u0000-\u0008\u000a-\u001f\u007f]|\/\*|!important|(^|\s)#(\s|$)/i.test(
      v,
    )
  )
    return false;
  const outside = withoutCssEscapes(v)
    .replace(/"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'/g, '""')
    .replace(/url\(data:[^\s"'()\\]*\)/gi, 'url()');
  if (/[;{}\\<>]/.test(outside)) return false;
  let depth = 0;
  for (const c of outside.replace(/""/g, '')) {
    if (c === '"' || c === "'") return false;
    if (c === '(') depth++;
    if (c === ')' && --depth < 0) return false;
  }
  return depth === 0;
}
