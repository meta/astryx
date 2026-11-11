// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Color math for `astryx experimental theme`: parse a CSS color to RGB,
 * contrast ratios, mixing, value type checks, and the accent derivation.
 * @position api/theme-edit — pure helpers
 */

/** @typedef {[number, number, number]} Rgb */

/**
 * The RGB of a hex, rgb() or white/black color, or null for anything else.
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
  if (/^white$/i.test(s)) return [255, 255, 255];
  if (/^black$/i.test(s)) return [0, 0, 0];
  return null;
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

/** Whether a value reads as one CSS color. @param {unknown} v */
export const isColorValue = v =>
  /^(#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|(rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color|color-mix|light-dark)\(.+\)|var\(--[a-z0-9-]+\)|transparent|currentcolor|inherit|[a-z]+)$/i.test(
    String(v).trim(),
  );

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
