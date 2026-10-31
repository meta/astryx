// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file statusColor.ts
 * @input Concrete sRGB colours (hex or rgb()) from resolved theme tokens
 * @output Contrast, OKLCH, chroma, and lightness-solving helpers for status roles
 * @position Pure colour maths shared by status-role derivation
 *   (architecture:theme-compilation INV17) and the status contrast checks.
 *
 * Contrast follows WCAG 2.x relative luminance. Lightness adjustments move a
 * colour along OKLCH lightness at its own hue, reducing chroma only as far as
 * needed to stay inside sRGB, so a derived role keeps its status hue.
 */

import {formatHex, parseColor, type RGBA} from '../utils/color';

export interface OKLCH {
  l: number;
  c: number;
  h: number;
}

const toLinear = (v: number): number => {
  const c = v / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
};

const fromLinear = (v: number): number => {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055;
  return c * 255;
};

/** Composite a possibly translucent colour over an opaque backdrop. */
export function composite(top: RGBA, under: RGBA): RGBA {
  const a = top.a;
  return {
    r: top.r * a + under.r * (1 - a),
    g: top.g * a + under.g * (1 - a),
    b: top.b * a + under.b * (1 - a),
    a: 1,
  };
}

/** WCAG relative luminance of an opaque colour. */
export function relativeLuminance({r, g, b}: RGBA): number {
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

/** WCAG contrast ratio. A translucent foreground is composited over the background first. */
export function contrastRatio(foreground: RGBA, background: RGBA): number {
  const bg =
    background.a < 1
      ? composite(background, {r: 255, g: 255, b: 255, a: 1})
      : background;
  const fg = foreground.a < 1 ? composite(foreground, bg) : foreground;
  const a = relativeLuminance(fg);
  const b = relativeLuminance(bg);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

/** Convert opaque sRGB to OKLCH. */
export function toOklch({r, g, b}: RGBA): OKLCH {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(
    0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb,
  );
  const m = Math.cbrt(
    0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb,
  );
  const s = Math.cbrt(
    0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb,
  );
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return {l: L, c: Math.hypot(A, B), h: Math.atan2(B, A)};
}

function oklchToLinear({l: L, c, h}: OKLCH): [number, number, number] {
  const A = c * Math.cos(h);
  const B = c * Math.sin(h);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** Convert OKLCH to sRGB, reducing chroma at the same lightness and hue until it fits. */
export function fromOklch(color: OKLCH): RGBA {
  let c = color.c;
  for (let i = 0; i < 40; i++) {
    const rgb = oklchToLinear({...color, c});
    if (rgb.every(v => v >= -1e-4 && v <= 1 + 1e-4)) {
      const [r, g, b] = rgb.map(v => fromLinear(Math.min(1, Math.max(0, v))));
      return {r, g, b, a: 1};
    }
    c *= 0.9;
  }
  const [r, g, b] = oklchToLinear({...color, c: 0}).map(v =>
    fromLinear(Math.min(1, Math.max(0, v))),
  );
  return {r, g, b, a: 1};
}

/** Lowest chroma and lightness band a status colour may occupy and still read as a hue. */
export const STATUS_CHROMA_FLOOR = 0.03;
export const STATUS_LIGHTNESS_RANGE: readonly [number, number] = [0.2, 0.95];

/**
 * Whether a colour reads as a hue rather than a neutral grey, near-black, or
 * near-white (architecture:theme-tokens INV11). Translucent colours are judged
 * on their own channels.
 */
export function isChromatic(color: RGBA): boolean {
  const {l, c} = toOklch(color);
  return (
    c >= STATUS_CHROMA_FLOOR &&
    l >= STATUS_LIGHTNESS_RANGE[0] &&
    l <= STATUS_LIGHTNESS_RANGE[1]
  );
}

/**
 * Move `color` along OKLCH lightness, at its own hue, until it reaches
 * `ratio` against every backdrop. Moves away from the backdrops' luminance;
 * returns the colour unchanged when it already passes, or null when no
 * lightness at that hue reaches the ratio.
 */
export function solveLightness(
  color: RGBA,
  backdrops: ReadonlyArray<RGBA>,
  ratio: number,
): RGBA | null {
  const passes = (candidate: RGBA): boolean =>
    backdrops.every(backdrop => contrastRatio(candidate, backdrop) >= ratio);
  const opaque = {...color, a: 1};
  if (passes(opaque)) {
    return opaque;
  }
  const meanLuminance =
    backdrops.reduce((sum, b) => sum + relativeLuminance(b), 0) /
    backdrops.length;
  const base = toOklch(opaque);
  // Light backdrops need a darker colour; dark backdrops a lighter one.
  const darker = meanLuminance > 0.18;
  let lo = darker ? 0 : base.l;
  let hi = darker ? base.l : 1;
  const at = (l: number): RGBA => fromOklch({...base, l});
  const target = darker ? at(0) : at(1);
  if (!passes(target)) {
    return null;
  }
  // Binary search for the passing lightness closest to the original.
  for (let i = 0; i < 32; i++) {
    const mid = (lo + hi) / 2;
    const ok = passes(at(mid));
    if (darker) {
      if (ok) {lo = mid;}
      else {hi = mid;}
    } else if (ok) {hi = mid;}
    else {lo = mid;}
  }
  const solved = at(darker ? lo : hi);
  return passes(solved) ? solved : target;
}

/** Parse a concrete colour, returning null for anything unresolved. */
export function parseConcreteColor(value: string | undefined): RGBA | null {
  return value === undefined ? null : parseColor(value);
}

/** `#RRGGBB` or `#RRGGBBAA` for a colour. */
export function toHex(color: RGBA): string {
  const hex = formatHex(color.r, color.g, color.b);
  if (color.a >= 1) {
    return hex;
  }
  const alpha = Math.round(color.a * 255)
    .toString(16)
    .padStart(2, '0')
    .toUpperCase();
  return `${hex}${alpha}`;
}
