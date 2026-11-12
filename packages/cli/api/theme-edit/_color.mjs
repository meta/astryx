// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Color reading for `astryx experimental theme`: parse a CSS color to
 * RGB as CSS Color 4 reads it, say why a value cannot seed a color, the
 * contrast ratio (on the palette code's luminance), and value type checks.
 * The theme's colors themselves come from the palette generator.
 * @position api/theme-edit — pure helpers
 */

import {CSS_WIDE_KEYWORDS} from '../theme/build/font-warning.mjs';
import {matchType} from './_css.mjs';
import {luminance, oklabToLinearRgb} from '../theme/palette/generate/color.mjs';

/** @typedef {[number, number, number]} Rgb */

/** The CSS named colors. */
const NAMED = /** @type {Record<string, string>} */ ({
  aliceblue: '#f0f8ff',
  antiquewhite: '#faebd7',
  aqua: '#00ffff',
  aquamarine: '#7fffd4',
  azure: '#f0ffff',
  beige: '#f5f5dc',
  bisque: '#ffe4c4',
  black: '#000000',
  blanchedalmond: '#ffebcd',
  blue: '#0000ff',
  blueviolet: '#8a2be2',
  brown: '#a52a2a',
  burlywood: '#deb887',
  cadetblue: '#5f9ea0',
  chartreuse: '#7fff00',
  chocolate: '#d2691e',
  coral: '#ff7f50',
  cornflowerblue: '#6495ed',
  cornsilk: '#fff8dc',
  crimson: '#dc143c',
  cyan: '#00ffff',
  darkblue: '#00008b',
  darkcyan: '#008b8b',
  darkgoldenrod: '#b8860b',
  darkgray: '#a9a9a9',
  darkgreen: '#006400',
  darkgrey: '#a9a9a9',
  darkkhaki: '#bdb76b',
  darkmagenta: '#8b008b',
  darkolivegreen: '#556b2f',
  darkorange: '#ff8c00',
  darkorchid: '#9932cc',
  darkred: '#8b0000',
  darksalmon: '#e9967a',
  darkseagreen: '#8fbc8f',
  darkslateblue: '#483d8b',
  darkslategray: '#2f4f4f',
  darkslategrey: '#2f4f4f',
  darkturquoise: '#00ced1',
  darkviolet: '#9400d3',
  deeppink: '#ff1493',
  deepskyblue: '#00bfff',
  dimgray: '#696969',
  dimgrey: '#696969',
  dodgerblue: '#1e90ff',
  firebrick: '#b22222',
  floralwhite: '#fffaf0',
  forestgreen: '#228b22',
  fuchsia: '#ff00ff',
  gainsboro: '#dcdcdc',
  ghostwhite: '#f8f8ff',
  gold: '#ffd700',
  goldenrod: '#daa520',
  gray: '#808080',
  green: '#008000',
  greenyellow: '#adff2f',
  grey: '#808080',
  honeydew: '#f0fff0',
  hotpink: '#ff69b4',
  indianred: '#cd5c5c',
  indigo: '#4b0082',
  ivory: '#fffff0',
  khaki: '#f0e68c',
  lavender: '#e6e6fa',
  lavenderblush: '#fff0f5',
  lawngreen: '#7cfc00',
  lemonchiffon: '#fffacd',
  lightblue: '#add8e6',
  lightcoral: '#f08080',
  lightcyan: '#e0ffff',
  lightgoldenrodyellow: '#fafad2',
  lightgray: '#d3d3d3',
  lightgreen: '#90ee90',
  lightgrey: '#d3d3d3',
  lightpink: '#ffb6c1',
  lightsalmon: '#ffa07a',
  lightseagreen: '#20b2aa',
  lightskyblue: '#87cefa',
  lightslategray: '#778899',
  lightslategrey: '#778899',
  lightsteelblue: '#b0c4de',
  lightyellow: '#ffffe0',
  lime: '#00ff00',
  limegreen: '#32cd32',
  linen: '#faf0e6',
  magenta: '#ff00ff',
  maroon: '#800000',
  mediumaquamarine: '#66cdaa',
  mediumblue: '#0000cd',
  mediumorchid: '#ba55d3',
  mediumpurple: '#9370db',
  mediumseagreen: '#3cb371',
  mediumslateblue: '#7b68ee',
  mediumspringgreen: '#00fa9a',
  mediumturquoise: '#48d1cc',
  mediumvioletred: '#c71585',
  midnightblue: '#191970',
  mintcream: '#f5fffa',
  mistyrose: '#ffe4e1',
  moccasin: '#ffe4b5',
  navajowhite: '#ffdead',
  navy: '#000080',
  oldlace: '#fdf5e6',
  olive: '#808000',
  olivedrab: '#6b8e23',
  orange: '#ffa500',
  orangered: '#ff4500',
  orchid: '#da70d6',
  palegoldenrod: '#eee8aa',
  palegreen: '#98fb98',
  paleturquoise: '#afeeee',
  palevioletred: '#db7093',
  papayawhip: '#ffefd5',
  peachpuff: '#ffdab9',
  peru: '#cd853f',
  pink: '#ffc0cb',
  plum: '#dda0dd',
  powderblue: '#b0e0e6',
  purple: '#800080',
  rebeccapurple: '#663399',
  red: '#ff0000',
  rosybrown: '#bc8f8f',
  royalblue: '#4169e1',
  saddlebrown: '#8b4513',
  salmon: '#fa8072',
  sandybrown: '#f4a460',
  seagreen: '#2e8b57',
  seashell: '#fff5ee',
  sienna: '#a0522d',
  silver: '#c0c0c0',
  skyblue: '#87ceeb',
  slateblue: '#6a5acd',
  slategray: '#708090',
  slategrey: '#708090',
  snow: '#fffafa',
  springgreen: '#00ff7f',
  steelblue: '#4682b4',
  tan: '#d2b48c',
  teal: '#008080',
  thistle: '#d8bfd8',
  tomato: '#ff6347',
  turquoise: '#40e0d0',
  violet: '#ee82ee',
  wheat: '#f5deb3',
  white: '#ffffff',
  whitesmoke: '#f5f5f5',
  yellow: '#ffff00',
  yellowgreen: '#9acd32',
});

/** The CSS named colors, for suggestions. */
export const COLOR_NAMES = Object.keys(NAMED);

/** Color keywords that are valid colors but have no fixed value. */
const KEYWORDS = ['transparent', 'currentcolor', ...CSS_WIDE_KEYWORDS];

/** CSS system colors: valid, but they follow the user's device. */
const SYSTEM = [
  'accentcolor',
  'accentcolortext',
  'activetext',
  'buttonborder',
  'buttonface',
  'buttontext',
  'canvas',
  'canvastext',
  'field',
  'fieldtext',
  'graytext',
  'highlight',
  'highlighttext',
  'linktext',
  'mark',
  'marktext',
  'selecteditem',
  'selecteditemtext',
  'visitedtext',
];

/** The CSS color functions. */
const FUNCTIONS =
  /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(.+\)$/i;

/** The functions that give one fixed color from numbers. */
const FIXED = /^(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)$/i;

/** The `color()` spaces this reader converts to sRGB. */
const COLOR_SPACES = ['srgb', 'srgb-linear', 'display-p3'];

/** @typedef {{n: number, unit: string}} Num */

/** One number with its unit, or null. @param {string} part @param {boolean} modern */
function num(part, modern) {
  if (modern && part.toLowerCase() === 'none') return {n: 0, unit: ''};
  const m =
    /^([+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)(%|deg|grad|rad|turn)?$/i.exec(
      part,
    );
  return m ? {n: Number(m[1]), unit: (m[2] ?? '').toLowerCase()} : null;
}

/**
 * The parts of a color function body as CSS Color 4 reads them: three
 * channels and an optional alpha, either comma-separated (rgb() and hsl()
 * only, alpha as the fourth) or space-separated with `/ alpha`. Null when
 * the body is not one of those shapes.
 * @param {string} fn
 * @param {string} body
 * @returns {{channels: Num[], alpha: number} | null}
 */
function args(fn, body) {
  /** @type {string[]} */
  let channels;
  /** @type {string | undefined} */
  let alpha;
  const legacy = body.includes(',');
  if (legacy) {
    if (!/^(rgba?|hsla?)$/i.test(fn) || body.includes('/')) return null;
    const parts = body.split(',').map(x => x.trim());
    if (parts.length !== 3 && parts.length !== 4) return null;
    if (parts.some(x => !x || /\s/.test(x))) return null;
    channels = parts.slice(0, 3);
    alpha = parts[3];
  } else {
    const [left, right, ...extra] = body.split('/');
    if (extra.length) return null;
    channels = left.trim().split(/\s+/).filter(Boolean);
    if (right !== undefined) {
      alpha = right.trim();
      if (!alpha || /\s/.test(alpha)) return null;
    }
  }
  if (channels.length !== 3) return null;
  const read = channels.map(x => num(x, !legacy));
  if (read.some(x => !x)) return null;
  let a = 1;
  if (alpha !== undefined) {
    const v = num(alpha, !legacy);
    if (!v || (v.unit && v.unit !== '%')) return null;
    a = Math.max(0, Math.min(1, v.unit === '%' ? v.n / 100 : v.n));
  }
  return {channels: /** @type {Num[]} */ (read), alpha: a};
}

/** A hue in degrees, from 0 up to 360. @param {Num} h */
const degrees = h => {
  const d =
    h.unit === 'turn'
      ? h.n * 360
      : h.unit === 'rad'
        ? (h.n * 180) / Math.PI
        : h.unit === 'grad'
          ? h.n * 0.9
          : h.n;
  return ((d % 360) + 360) % 360;
};

/** A number, with `%` read against `full`. @param {Num} v @param {number} full */
const amount = (v, full) => (v.unit === '%' ? (v.n / 100) * full : v.n);

/** @param {number} v @param {number} lo @param {number} hi */
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

/** How far a linear channel may stray past 0..1 before it counts as clipped. */
const GAMUT_SLACK = 0.0005;
/** Set when the color read last fell outside sRGB and was clipped. */
let clipped = false;

/** @param {number[]} lin linear sRGB @returns {Rgb} */
const fromLinear = lin =>
  /** @type {Rgb} */ (
    lin.map(c => {
      if (c < -GAMUT_SLACK || c > 1 + GAMUT_SLACK) clipped = true;
      const v = Math.max(0, Math.min(1, c));
      return (
        255 *
        (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
      );
    })
  );

/** @param {number} h degrees, 0 to 360 @param {number} s @param {number} l 0..1 @returns {Rgb} */
function hslToRgb(h, s, l) {
  /** @param {number} n */
  const f = n => {
    const k = (n + h / 30) % 12;
    return l - s * Math.min(l, 1 - l) * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

/** @param {number} l @param {number} a @param {number} b CIE Lab (D50) @returns {Rgb} */
function labToRgb(l, a, b) {
  const fy = (l + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const e = 216 / 24389;
  const k = 24389 / 27;
  const x = ((fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k) * 0.3457) / 0.3585;
  const y = l > k * e ? fy ** 3 : l / k;
  const z =
    ((fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k) * (1 - 0.3457 - 0.3585)) /
    0.3585;
  // XYZ D50 to linear sRGB (D65), Bradford-adapted.
  return fromLinear([
    3.1341359569958707 * x - 1.6173863321612538 * y - 0.4906619460083532 * z,
    -0.978795502912089 * x + 1.916254567259524 * y + 0.03344273116131949 * z,
    0.07195537988411677 * x - 0.2289768264158322 * y + 1.405386058324125 * z,
  ]);
}

/** @param {number} l @param {number} a @param {number} b OKLab @returns {Rgb} */
function oklabToRgb(l, a, b) {
  return fromLinear(oklabToLinearRgb(l, a, b));
}

/**
 * A `color()` value in sRGB: srgb as it is, srgb-linear and display-p3
 * through linear light, clipped to the sRGB gamut.
 * @param {string} space @param {number[]} c 0..1
 * @returns {Rgb}
 */
function colorSpaceToRgb(space, c) {
  if (space === 'srgb')
    return /** @type {Rgb} */ (c.map(v => clamp(v, 0, 1) * 255));
  if (space === 'srgb-linear') return fromLinear(c);
  const lin = c.map(v =>
    Math.abs(v) <= 0.04045
      ? v / 12.92
      : Math.sign(v) * ((Math.abs(v) + 0.055) / 1.055) ** 2.4,
  );
  const x =
    0.4865709486482162 * lin[0] +
    0.26566769316909306 * lin[1] +
    0.1982172852343625 * lin[2];
  const y =
    0.2289745640697488 * lin[0] +
    0.6917385218365064 * lin[1] +
    0.079286914093745 * lin[2];
  const z = 0.04511338185890264 * lin[1] + 1.043944368900976 * lin[2];
  return fromLinear([
    3.2409699419045226 * x - 1.537383177570094 * y - 0.4986107602930034 * z,
    -0.9692436362808796 * x + 1.8759675015077202 * y + 0.04155505740717559 * z,
    0.05563007969699366 * x - 0.20397695888897652 * y + 1.0569715142428786 * z,
  ]);
}

/** @param {number} c chroma, never below 0 @param {number} h degrees @returns {[number, number]} */
const polar = (c, h) => [
  c * Math.cos((h * Math.PI) / 180),
  c * Math.sin((h * Math.PI) / 180),
];

/**
 * The opacity of a CSS color, 0 to 1: the alpha of an 8- or 4-digit hex,
 * `rgba()`/`hsla()`, or a `/ alpha` part; 0 for `transparent`; 1 otherwise.
 * @param {unknown} value
 * @returns {number}
 */
export function alphaOf(value) {
  const s = String(value ?? '').trim();
  if (/^transparent$/i.test(s)) return 0;
  const read = readColor(s);
  if (read) return read.alpha;
  const h = /^#([0-9a-f]{4}|[0-9a-f]{8})$/i.exec(s);
  if (h) {
    const a = h[1].length === 4 ? h[1][3].repeat(2) : h[1].slice(6);
    return parseInt(a, 16) / 255;
  }
  const slash = /\/\s*(-?[\d.]+)(%?)\s*\)$/.exec(s);
  const comma = /^(?:rgba|hsla)\((?:[^,]*,){3}\s*(-?[\d.]+)(%?)\s*\)$/i.exec(s);
  const m = slash ?? comma;
  if (!m) return 1;
  const n = Number(m[1]) / (m[2] ? 100 : 1);
  return Math.max(0, Math.min(1, n));
}

/**
 * A color drawn at `alpha` over `under`, as the opaque color the eye sees.
 * @param {Rgb} over
 * @param {number} alpha
 * @param {Rgb} under
 * @returns {Rgb}
 */
export function compositeOver(over, alpha, under) {
  return /** @type {Rgb} */ (
    over.map((c, i) => c * alpha + under[i] * (1 - alpha))
  );
}

/**
 * A fixed CSS color read as CSS Color 4 reads it: hues wrap, saturation,
 * whiteness, blackness and lightness clamp to their range, and chroma
 * never goes below 0. Null for a value with no fixed color or with a
 * malformed function body.
 * @param {string} s trimmed
 * @returns {{rgb: Rgb, alpha: number} | null}
 */
function readColor(s) {
  clipped = false;
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return {
      rgb: [(n >> 16) & 255, (n >> 8) & 255, n & 255],
      alpha: h.length === 8 ? parseInt(h.slice(6), 16) / 255 : 1,
    };
  }
  const named = NAMED[s.toLowerCase()];
  if (named) return readColor(named);
  const fn = /^([a-z-]+)\((.*)\)$/i.exec(s);
  if (!fn || !FIXED.test(fn[1])) return null;
  const name = fn[1].toLowerCase();
  if (name === 'color') {
    const cm = /^\s*([a-z0-9-]+)\s+(.*)$/i.exec(fn[2]);
    const space = cm?.[1].toLowerCase() ?? '';
    if (!cm || !COLOR_SPACES.includes(space)) return null;
    const a = args('color', cm[2]);
    if (!a || a.channels.some(c => c.unit && c.unit !== '%')) return null;
    return {
      rgb: colorSpaceToRgb(
        space,
        a.channels.map(c => amount(c, 1)),
      ),
      alpha: a.alpha,
    };
  }
  const a = args(name, fn[2]);
  if (!a) return null;
  const [x, y, z] = a.channels;
  /** @type {Rgb} */
  let rgb;
  switch (name) {
    case 'rgb':
    case 'rgba':
      rgb = [amount(x, 255), amount(y, 255), amount(z, 255)];
      break;
    case 'hsl':
    case 'hsla':
      rgb = hslToRgb(
        degrees(x),
        clamp(amount(y, 100) / 100, 0, 1),
        clamp(amount(z, 100) / 100, 0, 1),
      );
      break;
    case 'hwb': {
      const w = clamp(amount(y, 100) / 100, 0, 1);
      const b = clamp(amount(z, 100) / 100, 0, 1);
      if (w + b >= 1) {
        const g = (w / (w + b)) * 255;
        rgb = [g, g, g];
      } else
        rgb = /** @type {Rgb} */ (
          hslToRgb(degrees(x), 1, 0.5).map(
            c => (c / 255) * (1 - w - b) * 255 + w * 255,
          )
        );
      break;
    }
    case 'lab':
      rgb = labToRgb(
        clamp(amount(x, 100), 0, 100),
        amount(y, 125),
        amount(z, 125),
      );
      break;
    case 'lch':
      rgb = labToRgb(
        clamp(amount(x, 100), 0, 100),
        ...polar(Math.max(0, amount(y, 150)), degrees(z)),
      );
      break;
    case 'oklab':
      rgb = oklabToRgb(
        clamp(amount(x, 1), 0, 1),
        amount(y, 0.4),
        amount(z, 0.4),
      );
      break;
    default:
      rgb = oklabToRgb(
        clamp(amount(x, 1), 0, 1),
        ...polar(Math.max(0, amount(y, 0.4)), degrees(z)),
      );
  }
  return {rgb, alpha: a.alpha};
}

/**
 * The RGB of a fixed CSS color: a hex, a named color, or rgb(), hsl(),
 * hwb(), lab(), lch(), oklab(), oklch() or color() in srgb, srgb-linear or
 * display-p3. Null for a value with no fixed color (`var()`,
 * `color-mix()`, `light-dark()`, a keyword, a system color) or a malformed
 * one. The alpha is not part of the RGB: see {@link alphaOf}.
 * @param {unknown} value
 * @returns {Rgb | null}
 */
export function parseColor(value) {
  return readColor(String(value ?? '').trim())?.rgb ?? null;
}

/**
 * Whether a fixed color lies outside sRGB (a wide-gamut `color(display-p3
 * …)` or a strong `oklch()`), so the RGB {@link parseColor} gives is the
 * nearest sRGB color, not the color itself.
 * @param {unknown} value
 */
export function isClipped(value) {
  return readColor(String(value ?? '').trim()) != null && clipped;
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
  if (isColorValue(s))
    return {
      kind: 'unfixed',
      message: 'has no fixed color, so no shades can be generated from it',
    };
  return {kind: 'unknown', message: 'is not a CSS color'};
}

/** @param {number[]} rgb */
export const hex = rgb =>
  `#${rgb
    .slice(0, 3)
    .map(x =>
      Math.round(Math.max(0, Math.min(255, x)))
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;

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
    /^var\(--[a-z0-9-]+\)$/i.test(s) ||
    // A variable with a color to fall back to.
    (/^var\(--[a-z0-9-]+\s*,\s*(.+)\)$/i.test(s) &&
      isColorValue(/^var\(--[a-z0-9-]+\s*,\s*(.+)\)$/i.exec(s)?.[1] ?? '')) ||
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
  const length =
    /^-?(\d+\.?\d*|\.\d+)(e-?\d+)?(px|rem|em|ex|ch|lh|rlh|cap|ic|pt|pc|cm|mm|in|q|%|vh|vw|vmin|vmax|dvh|dvw|svh|svw|lvh|lvw|cqw|cqh|cqi|cqb)$/i;
  if (s === '0') return true;
  // Only a property that takes a negative length gets one: an offset, a
  // letter spacing, an indent.
  if (length.test(s))
    return (
      !s.startsWith('-') || /offset|tracking|letter-spacing|indent/.test(name)
    );
  if (/^var\(--[a-z0-9-]+\)$/i.test(s)) return true;
  if (/^env\([a-z-]+(,.*)?\)$/i.test(s)) return true;
  return (
    /^(calc|min|max|clamp)\(/i.test(s) &&
    matchType('length-percentage', s) != null
  );
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
  if (/^var\(--[a-z0-9-]+\)$/i.test(s)) return true;
  if (/weight/.test(name))
    return (
      /^(normal|bold|bolder|lighter)$/.test(s) ||
      (/^\d+(\.\d+)?$/.test(s) && Number(s) >= 1 && Number(s) <= 1000)
    );
  if (/leading|line-height/.test(name))
    return (
      s === 'normal' ||
      (/^\d*\.?\d+(px|rem|em|%)?$/.test(s) && Number.parseFloat(s) >= 0) ||
      (/^calc\(/i.test(s) && matchType('length-percentage', s) != null) ||
      (/^calc\(/i.test(s) && matchType('number', s) != null)
    );
  return /^-?\d*\.?\d+$/.test(s);
};

/**
 * Whether a value can sit in a CSS declaration as it is: no `<>`, control
 * character, comment or `!important` anywhere; outside a quoted string or a
 * `url(data:…)`, no `;{}`; brackets and quotes closed. So `content: "a;b"`
 * and a base64 data URL are values, and nothing can end the declaration.
 * @param {string} v
 */
export function isSafeValue(v) {
  // A shell comment ("# direct"), as a command run without a shell passes
  // it, is a comment too.
  // `</` (a closing tag), control characters, comments and !important are
  // refused anywhere; < and > only outside a quoted string.
  // eslint-disable-next-line no-control-regex
  if (/<\/|[\u0000-\u001f\u007f]|\/\*|!important|(^|\s)#(\s|$)/i.test(v))
    return false;
  const outside = v
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
