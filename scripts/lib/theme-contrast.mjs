// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared helpers for the repo-level theme contrast guards.
 *
 * Resolves a theme token to a concrete colour for one colour scheme, through
 * `[light, dark]` pairs, `light-dark()` and `var()` references, and measures
 * text over stacked backgrounds with core's own colour parser and contrast
 * maths, so every guard measures the same way.
 *
 * @input Theme objects and token names.
 * @output The first-party theme list, a token resolver, and a layered
 *   contrast measure.
 * @position Library for scripts/check-*-contrast.test.mjs.
 */

import {butterTheme} from '../../packages/themes/butter/src/butterTheme.ts';
import {chocolateTheme} from '../../packages/themes/chocolate/src/chocolateTheme.ts';
import {gothicTheme} from '../../packages/themes/gothic/src/gothicTheme.ts';
import {matchaTheme} from '../../packages/themes/matcha/src/matchaTheme.ts';
import {neutralTheme} from '../../packages/themes/neutral/src/neutralTheme.ts';
import {stoneTheme} from '../../packages/themes/stone/src/stoneTheme.ts';
import {y2kTheme} from '../../packages/themes/y2k/src/y2kTheme.ts';
import {
  compositeOver,
  contrastRatio,
} from '../../packages/core/src/theme/contrast.ts';
import {parseColor} from '../../packages/core/src/utils/color.ts';

export const FIRST_PARTY_THEMES = {
  butter: butterTheme,
  chocolate: chocolateTheme,
  gothic: gothicTheme,
  matcha: matchaTheme,
  neutral: neutralTheme,
  stone: stoneTheme,
  y2k: y2kTheme,
};

export const MODES = ['light', 'dark'];

/** WCAG 2.2 AA for normal-size text. */
export const AA_NORMAL = 4.5;

/** Split a CSS argument list at top-level commas. */
function splitArgs(input) {
  const out = [];
  let depth = 0;
  let current = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  out.push(current.trim());
  return out;
}

/**
 * Resolve a token value to a concrete colour string for one scheme
 * (`modeIndex` 0 is light, 1 is dark), or null when it is not a colour.
 */
export function resolveColor(value, tokens, modeIndex, seen = new Set()) {
  if (Array.isArray(value)) {
    return resolveColor(value[modeIndex], tokens, modeIndex, seen);
  }
  if (typeof value !== 'string') return null;
  const v = value.trim();
  if (v.startsWith('light-dark(')) {
    const args = splitArgs(v.slice('light-dark('.length, -1));
    return resolveColor(args[modeIndex], tokens, modeIndex, seen);
  }
  if (v.startsWith('var(')) {
    const [name, fallback] = splitArgs(v.slice('var('.length, -1));
    if (seen.has(name)) return null;
    const next = tokens[name];
    if (next == null) {
      return fallback ? resolveColor(fallback, tokens, modeIndex, seen) : null;
    }
    return resolveColor(next, tokens, modeIndex, new Set([...seen, name]));
  }
  return parseColor(v) == null ? null : v;
}

/** A theme's tokens, with its local tokens, and optional overrides on top. */
export function themeTokens(theme, overrides = {}) {
  return {
    ...theme.localTokens,
    ...theme.tokens,
    ...Object.fromEntries(
      Object.entries(overrides).filter(([key]) => key.startsWith('--')),
    ),
  };
}

/**
 * Contrast of `foreground` over `layers`, listed from the topmost layer down.
 * Each translucent layer is composited over the one below it, and the bottom
 * layer over the scheme's canvas (white or black).
 */
export function layeredContrast(foreground, layers, modeIndex) {
  let backdrop =
    modeIndex === 0 ? {r: 255, g: 255, b: 255, a: 1} : {r: 0, g: 0, b: 0, a: 1};
  for (const layer of [...layers].reverse()) {
    backdrop = compositeOver(parseColor(layer), backdrop);
  }
  return contrastRatio(parseColor(foreground), backdrop);
}
