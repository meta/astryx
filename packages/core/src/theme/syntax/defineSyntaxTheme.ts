// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';

/**
 * @file defineSyntaxTheme.ts
 * @input syntaxTokenDefaults from tokens.ts
 * @output defineSyntaxTheme, SyntaxTheme, syntaxThemeStyle
 * @position Syntax theme definition API; consumed by presets, SyntaxTheme, defineTheme
 *
 * @see https://github.com/meta/astryx/issues/1148
 */

import {
  syntaxTokenDefaults,
  DIFF_SYNTAX_TOKEN_NAMES,
  type SyntaxTokenName,
} from './tokens';
import {devWarn} from '../../utils/devWarning';

// =============================================================================
// Types
// =============================================================================

/** Human-readable syntax token name (without CSS custom property prefix). */
export type SyntaxThemeTokenKey =
  | 'keyword'
  | 'string'
  | 'comment'
  | 'number'
  | 'function'
  | 'type'
  | 'variable'
  | 'operator'
  | 'constant'
  | 'tag'
  | 'attribute'
  | 'property'
  | 'punctuation'
  | 'background'
  | DiffSyntaxThemeTokenKey;

/** The diff row slots a syntax theme MAY set; unset ones keep their defaults. */
export type DiffSyntaxThemeTokenKey =
  'added' | 'removed' | 'diff-header' | 'added-marker' | 'removed-marker';

/**
 * Token value — either a single string or a [light, dark] tuple.
 * Tuples are converted to CSS light-dark() at theme creation time.
 */
export type SyntaxTokenValue = string | [light: string, dark: string];

/**
 * Token map for defineSyntaxTheme input — values can be strings or tuples.
 * The diff row slots are optional: a theme that sets none keeps the defaults
 * (semantic success/error muted tints and the muted surface).
 */
export type SyntaxThemeTokenInput = Record<
  Exclude<SyntaxThemeTokenKey, DiffSyntaxThemeTokenKey>,
  SyntaxTokenValue
> &
  Partial<Record<DiffSyntaxThemeTokenKey, SyntaxTokenValue>>;

/**
 * Resolved token map — all values are CSS strings (tuples resolved to
 * light-dark()). The diff row slots are optional here as in the input, so a
 * map written before they existed still type-checks; an unset slot renders
 * its default.
 */
export type SyntaxThemeTokenMap = Record<
  Exclude<SyntaxThemeTokenKey, DiffSyntaxThemeTokenKey>,
  string
> &
  Partial<Record<DiffSyntaxThemeTokenKey, string>>;

/** Input to defineSyntaxTheme. */
export interface SyntaxThemeInput {
  name: string;
  tokens: SyntaxThemeTokenInput;
}

/** A defined syntax theme — tokens are resolved to CSS strings. */
export interface SyntaxThemeDefinition {
  /** Theme name */
  name: string;
  /** Resolved token values (light-dark() CSS strings) */
  tokens: SyntaxThemeTokenMap;
  /** Original input tokens (preserves tuples for mode resolution) */
  __inputTokens: SyntaxThemeTokenInput;
}

// =============================================================================
// Token key <-> CSS property mapping
// =============================================================================

const CSS_PREFIX = '--color-syntax-';

function toCSSProperty(key: SyntaxThemeTokenKey): SyntaxTokenName {
  return (CSS_PREFIX + key) as SyntaxTokenName;
}

/** All valid human-readable token keys, derived from the defaults. */
export const ALL_SYNTAX_KEYS: SyntaxThemeTokenKey[] = Object.keys(
  syntaxTokenDefaults,
).map(k => k.replace(CSS_PREFIX, '') as SyntaxThemeTokenKey);

const DIFF_KEYS = new Set<SyntaxThemeTokenKey>(
  DIFF_SYNTAX_TOKEN_NAMES.map(
    name => name.replace(CSS_PREFIX, '') as SyntaxThemeTokenKey,
  ),
);

/** The marker slots: unset in a theme, they follow that theme's punctuation. */
const MARKER_KEYS = new Set<SyntaxThemeTokenKey>([
  'added-marker',
  'removed-marker',
]);

/** The keys every syntax theme must set: everything but the diff rows. */
export const REQUIRED_SYNTAX_KEYS: SyntaxThemeTokenKey[] =
  ALL_SYNTAX_KEYS.filter(key => !DIFF_KEYS.has(key));

// =============================================================================
// Helpers
// =============================================================================

/** Resolve a token value to a CSS string. Tuples become light-dark(). */
function resolveTokenValue(value: SyntaxTokenValue): string {
  if (Array.isArray(value)) {
    return `light-dark(${value[0]}, ${value[1]})`;
  }
  return value;
}

/**
 * Resolve a token value for a specific color mode.
 * - [light, dark] tuple → picks the correct side
 * - light-dark(a, b) string → parses and picks
 * - plain string → pass through
 */
export function resolveSyntaxTokenForMode(
  value: SyntaxTokenValue,
  mode: 'light' | 'dark',
): string {
  if (Array.isArray(value)) {
    return mode === 'dark' ? value[1] : value[0];
  }
  const match = value.match(/^light-dark\(([^,]+),([^)]+)\)$/);
  if (match) {
    return mode === 'dark' ? match[2].trim() : match[1].trim();
  }
  return value;
}

// =============================================================================
// defineSyntaxTheme
// =============================================================================

/**
 * Create a syntax theme from a complete token map.
 *
 * Token values can be:
 * - A string: used as-is (e.g. '#ff79c6' or 'light-dark(#0064E0, #2694FE)')
 * - A [light, dark] tuple: converted to light-dark(light, dark)
 *
 * @example
 * const myTheme = defineSyntaxTheme({
 *   name: 'my-theme',
 *   tokens: {
 *     keyword: ['#0064E0', '#2694FE'],     // [light, dark] tuple
 *     string: '#98c379',                    // same in both modes
 *     comment: 'light-dark(#666, #999)',    // CSS light-dark() string
 *     // ... all 14 tokens
 *   },
 * });
 */
export function defineSyntaxTheme(
  input: SyntaxThemeInput,
): SyntaxThemeDefinition {
  const missing = REQUIRED_SYNTAX_KEYS.filter(key => !(key in input.tokens));
  if (missing.length > 0) {
    devWarn(
      'defineSyntaxTheme',
      `"${input.name}": missing tokens: ${missing.join(', ')}. ` +
        `All ${REQUIRED_SYNTAX_KEYS.length} syntax colour tokens are required; ` +
        `the diff row slots (added, removed, diff-header, added-marker, removed-marker) are optional.`,
    );
  }

  // Resolve tuples to light-dark() CSS strings. An unset diff row paint keeps
  // its default so every existing theme renders a readable diff unchanged; an
  // unset marker slot takes this theme's own line-number colour (its
  // punctuation token) rather than the page theme's green and red, and an
  // unset header paint is none at all (the header row sits on this theme's
  // own background with punctuation text), so number, glyph, and header
  // text stay legible on this theme's background in every page mode — the
  // glyph's shape carries the meaning where the colour does not.
  const resolved: Partial<SyntaxThemeTokenMap> = {};
  for (const key of ALL_SYNTAX_KEYS) {
    const value = (
      input.tokens as Partial<Record<SyntaxThemeTokenKey, SyntaxTokenValue>>
    )[key];
    resolved[key] =
      value !== undefined
        ? resolveTokenValue(value)
        : MARKER_KEYS.has(key)
          ? 'var(--color-syntax-punctuation)'
          : key === 'diff-header'
            ? 'transparent'
            : syntaxTokenDefaults[toCSSProperty(key)];
  }

  return {
    name: input.name,
    tokens: resolved as SyntaxThemeTokenMap,
    __inputTokens: {...input.tokens},
  };
}

// =============================================================================
// Utilities
// =============================================================================

/** Generate a CSS custom property style object for React's style prop. */
export function syntaxThemeStyle(
  theme: SyntaxThemeDefinition,
): Record<string, string> {
  const vars: Record<string, string> = {};
  for (const key of ALL_SYNTAX_KEYS) {
    // An unset diff slot is left to its default rather than written empty.
    const value = theme.tokens[key];
    if (value !== undefined) vars[toCSSProperty(key)] = value;
  }
  return vars;
}

/** Convert a syntax theme to CSS declarations (no selector wrapper). */
export function syntaxThemeToCSS(theme: SyntaxThemeDefinition): string {
  // An unset diff slot is left to its default rather than written `undefined`.
  return ALL_SYNTAX_KEYS.filter(key => theme.tokens[key] !== undefined)
    .map(key => toCSSProperty(key) + ': ' + theme.tokens[key] + ';')
    .join('\n  ');
}
