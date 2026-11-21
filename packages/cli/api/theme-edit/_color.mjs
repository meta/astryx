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
  alphaOf,
  hex,
  mixColor,
  mixSide,
  namedColorHex,
  parseColor,
  readColor,
} from '../../foundation/color/css-color.mjs';
import {
  contrastRatio,
  hexToOklch,
  oklchClampedHex,
  ratioDown,
} from '../theme/palette/generate/color.mjs';

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

/**
 * The box color shorthands, which take one color per side, and how many
 * sides each names (`border-color: top right bottom left`).
 * @type {Record<string, number>}
 */
const COLOR_SIDE_COUNT = {
  'border-color': 4,
  'border-block-color': 2,
  'border-inline-color': 2,
};

/**
 * The sides each count of colors names, as CSS gives them out.
 * @type {Record<number, string[][]>}
 */
const SIDE_NAMES = {
  4: [['top'], ['right'], ['bottom'], ['left']],
  3: [['top'], ['right', 'left'], ['bottom']],
  2: [
    ['top', 'bottom'],
    ['right', 'left'],
  ],
};

/**
 * A box color shorthand's colors as typed, one per side (`#ddd #ddd
 * transparent`), each with the sides it colors; null for a property that
 * takes one color, or for one value. `tooMany` is set when the value has
 * more than the property takes.
 * @param {string} prop the property, as CSS names it
 * @param {string} value
 * @returns {{colors: Array<{color: string, sides: string[]}>, max: number, tooMany: boolean} | null}
 */
export function colorSides(prop, value) {
  const max = COLOR_SIDE_COUNT[prop];
  if (!max) return null;
  const parts = splitTop(String(value).trim(), ' ')
    .map(x => x.trim())
    .filter(Boolean);
  if (parts.length < 2) return null;
  const logical = max === 2 && prop !== 'border-color';
  /** @type {string[][]} */
  const names = logical
    ? [['start'], ['end']]
    : (SIDE_NAMES[parts.length] ?? []);
  return {
    colors: parts.map((color, i) => ({color, sides: names[i] ?? []})),
    max,
    tooMany: parts.length > max,
  };
}

/**
 * The opacity a slash after a color gives it, as Tailwind writes it
 * (`black/5` is black at 5%; `white/[.08]` and `white/[8%]` at 8%), read at
 * `at` (the slash), with how many characters it takes; null when no
 * opacity is written there. Only the share of the color is read: 0 to 100,
 * or 0 to 1 in brackets.
 * @param {string} text
 * @param {number} at
 * @returns {{alpha: number, length: number} | null}
 */
export function opacitySuffixAt(text, at) {
  const m =
    /^\/(?:(\d{1,3}(?:\.\d+)?)|\[\s*(\d*\.?\d+)\s*(%?)\s*\])(?![\w.%\]])/.exec(
      text.slice(at),
    );
  if (!m) return null;
  const n = m[1] != null ? Number(m[1]) / 100 : Number(m[2]) / (m[3] ? 100 : 1);
  if (!Number.isFinite(n) || n < 0 || n > 1) return null;
  return {alpha: n, length: m[0].length};
}

/**
 * A color at a share of its opacity, as CSS writes it: `rgb(r g b / a)`,
 * its own alpha included (a half-clear color at 50% is a quarter); null
 * for what is not a fixed color.
 * @param {string} color
 * @param {number} alpha 0 to 1
 * @returns {string | null}
 */
export function colorAtOpacity(color, alpha) {
  const rgb = parseColor(color);
  if (!rgb) return null;
  const a = Math.round(alphaOf(color) * alpha * 1000) / 1000;
  return `rgb(${rgb.map(c => Math.round(c)).join(' ')} / ${a})`;
}

/**
 * Tailwind's color/opacity shorthand written in a value (`0 0 0 1px
 * black/5`, `#000/10`, `white/[.08]`): each color written out (a hex or a
 * CSS color name) with an opacity after its slash. `color` is what CSS
 * writes for it; null for a color word this reader cannot read as one
 * (Tailwind's own stops, `blue-500/20`), which the caller names.
 * @param {string} value
 * @returns {Array<{index: number, typed: string, color: string | null}>}
 */
export function colorOpacitiesIn(value) {
  const text = String(value ?? '');
  /** @type {Array<{index: number, typed: string, color: string | null}>} */
  const out = [];
  // (A url() holds a path, `url(/img/white/24.png)`, never a color; so
  // does a quoted string, an image-set() path or a bare quoted path,
  // `"/img/red/50/a.png"`.)
  const urls = [
    ...text.matchAll(/\burl\(\s*(?:"[^"]*"|'[^']*'|[^)]*)\)|"[^"]*"|'[^']*'/gi),
  ].map(u => [u.index ?? 0, (u.index ?? 0) + u[0].length]);
  for (const m of text.matchAll(
    /(?<![\w#.])(#[0-9a-f]{3,8}|[a-z]+(?:-\d{2,3})?)(?=\/)/gi,
  )) {
    if (urls.some(([a, b]) => (m.index ?? 0) >= a && (m.index ?? 0) < b))
      continue;
    const at = (m.index ?? 0) + m[0].length;
    const op = opacitySuffixAt(text, at);
    if (!op) continue;
    const word = m[1].toLowerCase();
    const stop = /-\d{2,3}$/.test(word);
    const base = word.startsWith('#')
      ? parseColor(word)
        ? m[1]
        : null
      : namedColorHex(word);
    if (!base && !stop) continue;
    out.push({
      index: m.index ?? 0,
      typed: text.slice(m.index ?? 0, at + op.length),
      color: base ? colorAtOpacity(base, op.alpha) : null,
    });
  }
  return out;
}

/**
 * A value with each color/opacity shorthand in it written as CSS writes it
 * (`0 0 0 1px black/5` is `0 0 0 1px rgb(0 0 0 / 0.05)`), and the ones this
 * reader cannot read (Tailwind's own stops); null when the value has none.
 * @param {string} value
 * @returns {{css: string, found: ReturnType<typeof colorOpacitiesIn>, unread: ReturnType<typeof colorOpacitiesIn>} | null}
 */
export function colorOpacitiesAsCss(value) {
  const found = colorOpacitiesIn(value);
  if (!found.length) return null;
  const css = found.reduceRight(
    (v, x) =>
      x.color == null
        ? v
        : v.slice(0, x.index) + x.color + v.slice(x.index + x.typed.length),
    String(value),
  );
  return {css, found, unread: found.filter(x => x.color == null)};
}

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
 * A contrast ratio as a result says it: cut down to two decimals, never
 * rounded up, so a ratio just under what a check needs (4.497) never reads
 * as meeting it ("4.5:1, needs 4.5:1").
 * @param {number} r
 * @returns {string}
 */
export function ratioWords(r) {
  return ratioDown(r).toFixed(2);
}

/**
 * The WCAG contrast ratio of two colors.
 * @param {number[]} a
 * @param {number[]} b
 */
export function ratio(a, b) {
  return contrastRatio(hex(a), hex(b));
}

/**
 * The plain black or white that stands out most from a drawn color: what a
 * fix sets text or a border to so it reads.
 * @param {[number, number, number]} rgb
 */
export function plainOn(rgb) {
  return ratio([0, 0, 0], rgb) >= ratio([255, 255, 255], rgb)
    ? '#000000'
    : '#ffffff';
}

/** How far apart the lightness steps of {@link nearestReadingLightness} are. */
export const LIGHTNESS_STEP = 0.005;

/**
 * A color with only its lightness moved, its hue and chroma kept (as the
 * gamut allows), to the nearest lightness that reaches a contrast on each
 * ground: a brand-colored text stays that color. Black or white, whichever
 * stands out on the first ground, when no lightness does.
 * @param {[number, number, number]} from
 * @param {Array<[number, number, number]>} grounds
 * @param {number} need
 * @returns {string}
 */
export function nearestReadingLightness(from, grounds, need) {
  const {L, C, H} = hexToOklch(hex(from));
  /** @param {string} c */
  const reads = c => {
    const rgb = /** @type {[number, number, number]} */ (parseColor(c));
    return grounds.every(g => ratio(rgb, g) >= need);
  };
  for (let d = 0; d <= 1; d += LIGHTNESS_STEP)
    for (const at of [L - d, L + d]) {
      if (at < 0 || at > 1) continue;
      const c = oklchClampedHex(at, C, H);
      if (reads(c)) return c;
    }
  return plainOn(grounds[0]);
}

/**
 * How close two fills may look before a person cannot tell them apart at a
 * glance: their OKLab distance.
 */
export const LOOKS_ALIKE = 0.1;

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
