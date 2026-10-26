// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokens.ts
 * @input DefinedTheme objects and token names
 * @output Server-safe token helpers for resolving theme values and building CSS var references
 * @position Public theme utility; backs useTheme and external styling-library adapters
 *
 * Use these helpers when code outside React hooks needs Astryx token values:
 * build-time theme adapters, chart configuration, canvas/SVG rendering, tests,
 * or plain JS theme objects for other styling libraries.
 *
 * Derived tokens can reference other tokens (`var(--color-accent)`) and use CSS
 * color functions (`color-mix`). The resolver follows those references through
 * the theme iteratively and evaluates the supported color functions so callers
 * receive concrete raw values, not CSS expressions.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/theme/useTheme.ts
 * - /packages/core/src/theme/index.ts
 */

import {
  tokenDefaults,
  type DefinedTheme,
  type TokenName,
  type TokenValue,
} from './defineTheme';
import {parseColor, formatColor} from '../utils/color';
import {generatedScopedStatusRoleDefaults} from './generateThemeRules';

/** Resolved color mode used when choosing the side of light/dark token values. */
export type ResolvedThemeMode = 'light' | 'dark';

/** Options for resolving all tokens from a theme object. */
export interface ResolveThemeTokensOptions {
  /** Effective mode to resolve. Pass an explicit value; this helper does not read media queries. */
  mode: ResolvedThemeMode;
}

/** Options for resolving one token from a theme object. */
export interface ResolveThemeTokenOptions extends ResolveThemeTokensOptions {
  /** Value to return when the token name is unknown. Defaults to an empty string. */
  fallback?: string;
}

/**
 * Return a CSS custom property reference for an Astryx token name.
 *
 * Useful for non-StyleX styling-library configs (Panda, Chakra, MUI,
 * Emotion, styled-components, UnoCSS, CSS Modules) where the value should
 * stay connected to the active Astryx theme through the CSS cascade.
 *
 * @example
 * ```ts
 * const theme = {
 *   colors: {
 *     text: tokenVar('--color-text-primary'),
 *     surface: tokenVar('--color-background-surface'),
 *   },
 * };
 * ```
 */
export function tokenVar(name: TokenName | (string & {})): string {
  return `var(${name})`;
}

/** Flat map of every known Astryx token name to its `var(--token-name)` reference. */
export const tokenVars: Record<TokenName, string> = Object.fromEntries(
  Object.keys(tokenDefaults).map(name => [name, tokenVar(name)]),
) as Record<TokenName, string>;

/**
 * Split the arguments of a CSS function body on the first top-level comma.
 * Handles nested functions such as rgba(), color-mix(), var(), and quoted strings.
 */
function splitTopLevelComma(input: string): [string, string] | null {
  let depth = 0;
  let quote: '"' | "'" | null = null;
  let isEscaped = false;

  for (let i = 0; i < input.length; i++) {
    const char = input[i];

    if (quote !== null) {
      if (isEscaped) {
        isEscaped = false;
      } else if (char === '\\') {
        isEscaped = true;
      } else if (char === quote) {
        quote = null;
      }
      continue;
    }

    if (char === '"' || char === "'") {
      quote = char;
      continue;
    }

    if (char === '(') {
      depth++;
      continue;
    }

    if (char === ')') {
      depth = Math.max(0, depth - 1);
      continue;
    }

    if (char === ',' && depth === 0) {
      return [input.slice(0, i).trim(), input.slice(i + 1).trim()];
    }
  }

  return null;
}

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
function resolveXDSTokenValue(
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
// non-CSS consumers (canvas, SVG, data-viz) need the concrete value. These
// helpers replay the same resolution in JS: follow `var()` references through
// the resolved token map (iteratively, guarding against cycles) and evaluate
// the CSS color functions used by the theme generator against those values.

/** Index of the `)` matching the `(` at `openIndex`, or -1 when unbalanced. */
function findMatchingParen(input: string, openIndex: number): number {
  let depth = 0;
  for (let i = openIndex; i < input.length; i++) {
    const char = input[i];
    if (char === '(') {
      depth++;
    } else if (char === ')') {
      depth--;
      if (depth === 0) {
        return i;
      }
    }
  }
  return -1;
}

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
function evaluateColorFunctions(expr: string): string {
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

/**
 * Substitute `var(--name[, fallback])` references with their resolved values.
 * `seen` tracks the reference chain so cycles resolve to the literal reference
 * instead of recursing forever.
 */
function substituteVars(
  expr: string,
  raw: Record<string, string>,
  cache: Record<string, string>,
  seen: Set<string>,
): string {
  const start = expr.indexOf('var(');
  if (start === -1) {
    return expr;
  }
  const openIndex = start + 'var'.length;
  const closeIndex = findMatchingParen(expr, openIndex);
  if (closeIndex === -1) {
    return expr;
  }

  const inner = expr.slice(openIndex + 1, closeIndex);
  const commaSplit = splitTopLevelComma(inner);
  const name = (commaSplit ? commaSplit[0] : inner).trim();
  const fallback = commaSplit ? commaSplit[1] : null;

  let replacement: string;
  if (seen.has(name)) {
    replacement = expr.slice(start, closeIndex + 1);
  } else if (name in raw) {
    seen.add(name);
    replacement = resolveReference(name, raw, cache, seen);
    seen.delete(name);
  } else if (fallback !== null) {
    replacement = substituteVars(fallback.trim(), raw, cache, seen);
  } else {
    replacement = expr.slice(start, closeIndex + 1);
  }

  const rest = substituteVars(expr.slice(closeIndex + 1), raw, cache, seen);
  return expr.slice(0, start) + replacement + rest;
}

/** Fully resolve a single expression: substitute references, then evaluate colors. */
function resolveExpression(
  expr: string,
  raw: Record<string, string>,
  cache: Record<string, string>,
  seen: Set<string>,
): string {
  if (!expr.includes('var(') && !expr.includes('color-mix(')) {
    return expr;
  }
  const substituted = substituteVars(expr, raw, cache, seen);
  return evaluateColorFunctions(substituted);
}

/** Resolve one token by name, memoizing the result in `cache`. */
function resolveReference(
  name: string,
  raw: Record<string, string>,
  cache: Record<string, string>,
  seen: Set<string>,
): string {
  if (name in cache) {
    return cache[name];
  }
  const value = raw[name];
  if (value === undefined) {
    return '';
  }
  const resolved = resolveExpression(value, raw, cache, seen);
  cache[name] = resolved;
  return resolved;
}

/** Resolve every reference/color function in a raw token map to concrete values. */
function resolveReferences(
  raw: Record<string, string>,
): Record<string, string> {
  const cache: Record<string, string> = {};
  for (const name of Object.keys(raw)) {
    resolveReference(name, raw, cache, new Set<string>());
  }
  return cache;
}

/**
 * Resolve all Astryx token values for a theme and effective color mode.
 *
 * The result starts with `tokenDefaults`, applies `theme.tokens`, then
 * reapplies `theme.__inputTokens` when available so explicit tuple overrides
 * retain their original light/dark sides instead of relying on CSS parsing.
 * A final pass resolves any `var()` references between tokens and evaluates
 * the CSS color functions the theme generator emits (e.g. `color-mix`), so
 * derived tokens like `--color-text-accent` return concrete values rather than
 * `var(--color-accent)`. This mirrors the token resolution used by
 * `useTheme()` but does not need React context or media queries.
 *
 * Pass `theme` as null/undefined to resolve defaults only.
 */
export function resolveThemeTokens(
  theme: DefinedTheme | null | undefined,
  options: ResolveThemeTokensOptions,
): Record<string, string> {
  const {mode} = options;
  const resolved: Record<string, string> = {};

  for (const [key, value] of Object.entries(tokenDefaults)) {
    resolved[key] = resolveXDSTokenValue(value, mode);
  }

  if (theme == null) {
    return resolveReferences(resolved);
  }

  // A theme's local tokens resolve its references to them, then leave the
  // result: they are theme-local names, not Astryx tokens.
  const localKeys = new Set(Object.keys(theme.localTokens ?? {}));
  for (const [key, value] of Object.entries(theme.localTokens ?? {})) {
    resolved[key] = resolveXDSTokenValue(value, mode);
  }

  // Status roles the theme leaves unset resolve as its generated root CSS
  // declares them (architecture:theme-compilation INV16 and INV17), so
  // JavaScript and CSS agree (architecture:theme-tokens INV6).
  for (const [key, value] of generatedScopedStatusRoleDefaults(
    theme.tokens,
    theme.localTokens ?? {},
  )) {
    resolved[key] = resolveXDSTokenValue(value, mode);
  }

  for (const [key, value] of Object.entries(theme.tokens)) {
    resolved[key] = resolveXDSTokenValue(value, mode);
  }

  if (theme.__inputTokens) {
    for (const [key, value] of Object.entries(theme.__inputTokens)) {
      if (value !== undefined) {
        resolved[key] = resolveXDSTokenValue(value, mode);
      }
    }
  }

  return Object.fromEntries(
    Object.entries(resolveReferences(resolved)).filter(
      ([key]) => !localKeys.has(key),
    ),
  );
}

/** Resolve one Astryx token value for a theme and effective color mode. */
export function resolveThemeToken(
  theme: DefinedTheme | null | undefined,
  name: TokenName | (string & {}),
  options: ResolveThemeTokenOptions,
): string {
  const tokens = resolveThemeTokens(theme, options);
  return tokens[name] ?? options.fallback ?? '';
}
