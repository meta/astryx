// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Color math for `astryx experimental theme`: parse a CSS color to RGB,
 * contrast ratios, mixing, value type checks, and the accent derivation.
 * @position api/theme-edit — pure helpers
 */

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
 * The RGB of a hex, rgb() or named color, or null for anything else.
 * @param {unknown} value
 * @returns {Rgb | null}
 */
export function parseColor(value) {
  const s = String(value ?? '').trim();
  let m = /^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3) h = [...h].map(c => c + c).join('');
    const n = parseInt(h, 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  m = /^rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/i.exec(s);
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])];
  const named = NAMED[s.toLowerCase()];
  return named ? parseColor(named) : null;
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

/** @param {number[]} rgb */
const luminance = ([r, g, b]) => {
  /** @param {number} c */
  const f = c => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};

/**
 * The WCAG contrast ratio of two colors.
 * @param {number[]} a
 * @param {number[]} b
 */
export function ratio(a, b) {
  const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
  return (x + 0.05) / (y + 0.05);
}

/**
 * @param {number[]} a
 * @param {number[]} b
 * @param {number} t 0 gives a, 1 gives b
 * @returns {Rgb}
 */
export const mix = (a, b, t) => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

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

/**
 * The tokens one accent color sets. The color itself stays exact; accent
 * text is darkened (light) or lightened (dark) until it reads at 4.5:1.
 * A pair is `[light, dark]`.
 * @param {string} value
 * @returns {Record<string, string | [string, string]>}
 */
export function accentSet(value) {
  const c = parseColor(value);
  if (!c)
    return {
      '--color-accent': value,
      '--color-icon-accent': value,
      '--color-text-accent': value,
    };
  /** @type {Rgb} */
  const white = [255, 255, 255];
  /** @type {Rgb} */
  const black = [0, 0, 0];
  /** @type {Rgb} */
  const darkCard = [31, 31, 34];
  let text = c;
  for (let i = 0; i < 20 && ratio(text, white) < 4.5; i++)
    text = mix(text, black, 0.08);
  let darkText = c;
  for (let i = 0; i < 20 && ratio(darkText, darkCard) < 4.5; i++)
    darkText = mix(darkText, white, 0.08);
  return {
    '--color-accent': value,
    '--color-text-accent': [hex(text), hex(darkText)],
    '--color-icon-accent': [value, hex(darkText)],
    '--color-accent-muted': [hex(mix(c, white, 0.85)), hex(mix(c, black, 0.7))],
    '--color-on-accent':
      ratio(c, white) >= ratio(c, [17, 17, 17]) ? '#ffffff' : '#111111',
  };
}
