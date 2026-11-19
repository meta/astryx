// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file color.ts
 * @input CSS color strings (hex, rgb()/rgba(), a small set of named colors)
 * @output Shared color parsing/formatting primitives used across the design system
 * @position Package utility; backs theme token resolution, HCT color math, and chart/WebGL rendering
 *
 * A single home for the color parsers that were previously duplicated across
 * the theme layer, charts, and lab. Consumers get one well-tested definition of
 * "parse this color" rather than several subtly different regexes.
 */

/** A color decomposed into 0-255 RGB channels and a 0-1 alpha. */
export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** The named colors the design system relies on in token expressions. */
const NAMED_COLORS: Record<string, RGBA> = {
  transparent: {r: 0, g: 0, b: 0, a: 0},
  black: {r: 0, g: 0, b: 0, a: 1},
  white: {r: 255, g: 255, b: 255, a: 1},
};

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

/** Expand a shorthand hex body (`rgb`/`rgba`) to its full form (`rrggbb`/`rrggbbaa`). */
function expandShorthand(body: string): string {
  return body
    .split('')
    .map(c => c + c)
    .join('');
}

/**
 * Parse a hex color into {@link RGBA}. Accepts `#rgb`, `#rgba`, `#rrggbb`, and
 * `#rrggbbaa`, with or without the leading `#`. Returns null for anything else.
 */
export function parseHex(hex: string): RGBA | null {
  if (typeof hex !== 'string') {
    return null;
  }
  const body = hex.trim().replace(/^#/, '');
  const normalized =
    body.length === 3 || body.length === 4 ? expandShorthand(body) : body;

  if (
    (normalized.length !== 6 && normalized.length !== 8) ||
    !/^[0-9a-fA-F]+$/.test(normalized)
  ) {
    return null;
  }

  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
    a: normalized.length === 8 ? parseInt(normalized.slice(6, 8), 16) / 255 : 1,
  };
}

/**
 * Parse an `rgb()`/`rgba()` color into {@link RGBA}. Accepts comma- or
 * space-separated channels, an optional `/ alpha`, and percentage channels.
 */
export function parseRgb(value: string): RGBA | null {
  const open = value.indexOf('(');
  if (open === -1 || !value.trim().endsWith(')')) {
    return null;
  }
  const body = value
    .slice(open + 1, value.lastIndexOf(')'))
    .replace(/\//g, ' ');
  const parts = body
    .split(/[\s,]+/)
    .map(p => p.trim())
    .filter(Boolean);
  if (parts.length < 3) {
    return null;
  }

  const channel = (p: string): number => {
    const n = p.endsWith('%') ? (parseFloat(p) / 100) * 255 : parseFloat(p);
    return clamp(n, 0, 255);
  };
  const r = channel(parts[0]);
  const g = channel(parts[1]);
  const b = channel(parts[2]);
  if ([r, g, b].some(Number.isNaN)) {
    return null;
  }

  let a = 1;
  if (parts.length >= 4) {
    const raw = parts[3];
    a = raw.endsWith('%') ? parseFloat(raw) / 100 : parseFloat(raw);
    if (Number.isNaN(a)) {
      return null;
    }
    a = clamp(a, 0, 1);
  }
  return {r, g, b, a};
}

/**
 * Parse a concrete CSS color string into {@link RGBA}. Supports hex,
 * `rgb()`/`rgba()`, and the named colors used in token expressions. Returns
 * null for anything it can't evaluate (e.g. `var()`, `oklch()`, unknown names)
 * so callers can preserve the original expression rather than guessing.
 */
export function parseColor(value: string): RGBA | null {
  const trimmed = value.trim();
  // A plain record answers `constructor` and `__proto__` from
  // Object.prototype, so the lookup must test own properties.
  const name = trimmed.toLowerCase();
  if (Object.hasOwn(NAMED_COLORS, name)) {
    return {...NAMED_COLORS[name]};
  }
  if (trimmed.startsWith('#')) {
    return parseHex(trimmed);
  }
  if (/^rgba?\(/i.test(trimmed)) {
    return parseRgb(trimmed);
  }
  return null;
}

/** Format RGB channels (0-255) as an uppercase `#RRGGBB` string. */
export function formatHex(r: number, g: number, b: number): string {
  const channel = (c: number): string =>
    clamp(Math.round(c), 0, 255).toString(16).padStart(2, '0').toUpperCase();
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/**
 * Serialize {@link RGBA} to a compact, JS-usable CSS color: `#RRGGBB` when
 * fully opaque, otherwise `rgba(r, g, b, a)`.
 */
export function formatColor({r, g, b, a}: RGBA): string {
  if (a >= 1) {
    return formatHex(r, g, b);
  }
  const round = (n: number): number => clamp(Math.round(n), 0, 255);
  return `rgba(${round(r)}, ${round(g)}, ${round(b)}, ${parseFloat(a.toFixed(4))})`;
}

/** Neutral fallback (mid-grey) for colors a GL path can't parse — visible, never NaN. */
const GL_FALLBACK: [number, number, number] = [0.5, 0.5, 0.5];

/**
 * Convert a parsed {@link RGBA} to `[r, g, b]` floats in 0-1 for WebGL
 * uniforms and attributes.
 *
 * Takes the parsed type rather than a raw string so every caller goes through
 * one validation path ({@link parseHex} / {@link parseColor}) — compose as
 * `toGLFloats(parseHex(color))`. Unparseable input (null) and non-finite
 * channels return a neutral mid-grey fallback, so the GPU never receives a
 * NaN uniform. Alpha is intentionally dropped — GL chart paths blend with
 * their own alpha.
 */
export function toGLFloats(color: RGBA | null): [number, number, number] {
  if (color === null || ![color.r, color.g, color.b].every(Number.isFinite)) {
    return GL_FALLBACK;
  }
  const channel = (c: number): number => clamp(c, 0, 255) / 255;
  return [channel(color.r), channel(color.g), channel(color.b)];
}
