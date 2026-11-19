// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokenValues.ts
 * @input Token values: `[light, dark]` pairs, `light-dark()` strings, and the
 *   CSS color functions the theme generator emits
 * @output A token value for one color mode, color functions evaluated, and
 *   the default tokens resolved for a mode
 * @position Pure token resolution, used by `resolveThemeTokens` and by
 *   `@astryxdesign/core/palette`, which reads Core's defaults without the
 *   theme runtime
 */

import type {TokenValue} from './defineTheme';
import {parseColor, formatColor} from '../utils/color';
import {tokenDefaults} from './tokenDefaults';
import {
  findMatchingParen,
  resolveTokenReferences,
  splitTopLevelComma,
} from './tokenReferences';

/** Resolved color mode used when choosing the side of light/dark token values. */
export type ResolvedThemeMode = 'light' | 'dark';

/** Parse a CSS light-dark(light, dark) function into its two argument values. */
function parseLightDark(value: string): [light: string, dark: string] | null {
  const trimmed = value.trim();
  const prefix = 'light-dark(';
  if (!trimmed.startsWith(prefix) || !trimmed.endsWith(')')) {
    return null;
  }

  const inner = trimmed.slice(prefix.length, -1);
  return splitTopLevelComma(inner);
}

/**
 * Resolve a token value for a specific mode.
 *
 * - `[light, dark]` tuple → picks the side for `mode`
 * - `light-dark(light, dark)` string → parses nested CSS values and picks the side
 * - any other string → returned unchanged
 */
export function resolveXDSTokenValue(
  value: TokenValue,
  mode: ResolvedThemeMode,
): string {
  if (Array.isArray(value)) {
    return mode === 'dark' ? value[1] : value[0];
  }

  const parsed = parseLightDark(value);
  if (parsed !== null) {
    return mode === 'dark' ? parsed[1] : parsed[0];
  }

  return value;
}

// =============================================================================
// Reference resolution — turn token expressions into concrete raw values
// =============================================================================
//
// Generated themes emit derived tokens as references to other tokens rather
// than baked-in values, so a scoped CSS override of a base token re-themes the
// subtree that references it. The CSS cascade resolves those references, but
// non-CSS consumers (canvas, SVG, data-viz) need the concrete value. The same
// resolution replays in JS: tokenReferences.ts follows `var()` references
// through the resolved token map (guarding against cycles), and these helpers
// evaluate the CSS color functions used by the theme generator against those
// values.

/** Split a color-mix component into its color and optional percentage. */
function parseMixComponent(
  part: string,
): {color: string; percentage: number | null} | null {
  const trimmed = part.trim();
  const match = trimmed.match(/\s+([\d.]+)%$/);
  if (match) {
    return {
      color: trimmed.slice(0, match.index).trim(),
      percentage: parseFloat(match[1]),
    };
  }
  return {color: trimmed, percentage: null};
}

/**
 * Evaluate `color-mix(in <space>, c1 [p1], c2 [p2])` to a concrete color.
 *
 * Supports the `srgb` color space (the one the theme generator emits) using
 * the CSS Color 5 algorithm: normalize the percentages, interpolate the
 * premultiplied channels, then apply the alpha multiplier when the mix weights
 * sum to less than 100%. Returns null for anything it can't evaluate so the
 * original expression is preserved rather than guessed.
 */
function evaluateColorMix(body: string): string | null {
  const spaceMatch = body.match(/^in\s+([\w-]+)\s*,\s*(.+)$/s);
  if (!spaceMatch) {
    return null;
  }
  const [, colorSpace, rest] = spaceMatch;
  if (colorSpace.toLowerCase() !== 'srgb') {
    return null;
  }

  const split = splitTopLevelComma(rest);
  if (split === null) {
    return null;
  }
  const first = parseMixComponent(split[0]);
  const second = parseMixComponent(split[1]);
  if (first === null || second === null) {
    return null;
  }

  const c1 = parseColor(first.color);
  const c2 = parseColor(second.color);
  if (c1 === null || c2 === null) {
    return null;
  }

  // Fill in omitted percentages, then normalize so they sum to 100%.
  let p1: number;
  let p2: number;
  if (first.percentage !== null && second.percentage !== null) {
    p1 = first.percentage;
    p2 = second.percentage;
  } else if (first.percentage !== null) {
    p1 = first.percentage;
    p2 = 100 - p1;
  } else if (second.percentage !== null) {
    p2 = second.percentage;
    p1 = 100 - p2;
  } else {
    p1 = 50;
    p2 = 50;
  }
  const sum = p1 + p2;
  if (sum <= 0) {
    return null;
  }
  const w1 = p1 / sum;
  const w2 = p2 / sum;
  const alphaMultiplier = sum < 100 ? sum / 100 : 1;

  // Interpolate in premultiplied sRGB, then un-premultiply.
  const mixedA = w1 * c1.a + w2 * c2.a;
  const premix = (k1: number, k2: number): number =>
    w1 * k1 * c1.a + w2 * k2 * c2.a;
  const rp = premix(c1.r, c2.r);
  const gp = premix(c1.g, c2.g);
  const bp = premix(c1.b, c2.b);
  const rgb =
    mixedA === 0
      ? {r: 0, g: 0, b: 0}
      : {r: rp / mixedA, g: gp / mixedA, b: bp / mixedA};

  return formatColor({...rgb, a: mixedA * alphaMultiplier});
}

/** Evaluate every supported color function in an expression, innermost first. */
export function evaluateColorFunctions(expr: string): string {
  const idx = expr.indexOf('color-mix(');
  if (idx === -1) {
    return expr;
  }
  const openIndex = idx + 'color-mix'.length;
  const closeIndex = findMatchingParen(expr, openIndex);
  if (closeIndex === -1) {
    return expr;
  }
  const body = evaluateColorFunctions(expr.slice(openIndex + 1, closeIndex));
  const evaluated = evaluateColorMix(body);
  const replacement = evaluated ?? `color-mix(${body})`;
  return (
    expr.slice(0, idx) +
    replacement +
    evaluateColorFunctions(expr.slice(closeIndex + 1))
  );
}

/** Every Astryx token's default value in a color mode, references and color functions resolved. */
export function resolveDefaultTokens(
  mode: ResolvedThemeMode,
): Record<string, string> {
  const resolved: Record<string, string> = {};
  for (const [key, value] of Object.entries(tokenDefaults)) {
    resolved[key] = resolveXDSTokenValue(value, mode);
  }
  return resolveTokenReferences(resolved, evaluateColorFunctions);
}
