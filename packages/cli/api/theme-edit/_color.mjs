// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Color reading for `astryx experimental theme`: parse a CSS color to
 * RGB, the contrast ratio (on the palette code's luminance), and value type
 * checks. The theme's colors themselves come from the palette generator.
 * @position api/theme-edit — pure helpers
 */

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

/** Color keywords that are valid colors but have no fixed value. */
const KEYWORDS = [
  'transparent',
  'currentcolor',
  'inherit',
  'initial',
  'unset',
  'revert',
];

/** The CSS color functions. */
const FUNCTIONS =
  /^(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(.+\)$/i;

/**
 * The numbers inside a color function, each as a number with its unit:
 * commas, spaces and a `/ alpha` part are all accepted; the alpha is dropped.
 * @param {string} body
 * @returns {Array<{n: number, unit: string}> | null}
 */
function args(body) {
  const parts = body
    .split('/')[0]
    .trim()
    .split(/[\s,]+/)
    .filter(Boolean);
  const out = [];
  for (const part of parts) {
    if (part === 'none') {
      out.push({n: 0, unit: ''});
      continue;
    }
    const m = /^(-?\d*\.?\d+(?:e-?\d+)?)(%|deg|grad|rad|turn)?$/i.exec(part);
    if (!m) return null;
    out.push({n: Number(m[1]), unit: (m[2] ?? '').toLowerCase()});
  }
  return out;
}

/** A hue in degrees. @param {{n: number, unit: string}} h */
const degrees = h =>
  h.unit === 'turn'
    ? h.n * 360
    : h.unit === 'rad'
      ? (h.n * 180) / Math.PI
      : h.unit === 'grad'
        ? h.n * 0.9
        : h.n;

/** A number, with `%` read against `full`. @param {{n: number, unit: string}} v @param {number} full */
const amount = (v, full) => (v.unit === '%' ? (v.n / 100) * full : v.n);

/** @param {number[]} lin linear sRGB @returns {Rgb} */
const fromLinear = lin =>
  /** @type {Rgb} */ (
    lin.map(c => {
      const v = Math.max(0, Math.min(1, c));
      return (
        255 *
        (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055)
      );
    })
  );

/** @param {number} h @param {number} s @param {number} l 0..1 @returns {Rgb} */
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

/** @param {number} c @param {number} h degrees @returns {[number, number]} */
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
 * The RGB of a fixed CSS color: a hex, a named color, or rgb(), hsl(),
 * hwb(), lab(), lch(), oklab() or oklch(). Null for a value with no fixed
 * color (`var()`, `color-mix()`, `light-dark()`, `color()`, a keyword).
 * @param {unknown} value
 * @returns {Rgb | null}
 */
export function parseColor(value) {
  const s = String(value ?? '').trim();
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length <= 4) h = [...h].map(c => c + c).join('');
    const n = parseInt(h.slice(0, 6), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  const named = NAMED[s.toLowerCase()];
  if (named) return parseColor(named);
  const fn = /^([a-z]+)\((.*)\)$/i.exec(s);
  const a = fn && args(fn[2]);
  if (!fn || !a || a.length < 3) return null;
  const [x, y, z] = a;
  switch (fn[1].toLowerCase()) {
    case 'rgb':
    case 'rgba':
      return [amount(x, 255), amount(y, 255), amount(z, 255)];
    case 'hsl':
    case 'hsla':
      return hslToRgb(degrees(x), amount(y, 100) / 100, amount(z, 100) / 100);
    case 'hwb': {
      let w = amount(y, 100) / 100;
      let b = amount(z, 100) / 100;
      if (w + b >= 1) {
        const g = (w / (w + b)) * 255;
        return [g, g, g];
      }
      return /** @type {Rgb} */ (
        hslToRgb(degrees(x), 1, 0.5).map(
          c => (c / 255) * (1 - w - b) * 255 + w * 255,
        )
      );
    }
    case 'lab':
      return labToRgb(amount(x, 100), amount(y, 125), amount(z, 125));
    case 'lch':
      return labToRgb(amount(x, 100), ...polar(amount(y, 150), degrees(z)));
    case 'oklab':
      return oklabToRgb(amount(x, 1), amount(y, 0.4), amount(z, 0.4));
    case 'oklch':
      return oklabToRgb(amount(x, 1), ...polar(amount(y, 0.4), degrees(z)));
    default:
      return null;
  }
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
 * Whether a value is one CSS color: a hex, a color function, a named color,
 * a color keyword, or a variable.
 * @param {unknown} v
 */
export const isColorValue = v => {
  const s = String(v).trim();
  return (
    /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(s) ||
    FUNCTIONS.test(s) ||
    /^var\(--[a-z0-9-]+\)$/i.test(s) ||
    Object.hasOwn(NAMED, s.toLowerCase()) ||
    KEYWORDS.includes(s.toLowerCase())
  );
};

/** Whether a value reads as one CSS size. @param {unknown} v */
export const isSize = v =>
  /^(-?\d*\.?\d+(px|rem|em|%|vh|vw)?|0|var\(--[a-z0-9-]+\)|calc\(.+\))$/i.test(
    String(v).trim(),
  );

/** Whether a value reads as a number. @param {unknown} v */
export const isNumber = v => /^-?\d*\.?\d+$|^var\(/.test(String(v).trim());
