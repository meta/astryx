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
 * - /packages/core/src/theme/tokenReferences.ts (the `var()` resolver)
 * - /packages/core/src/theme/tokenValues.ts (one value per mode, color functions)
 * - /packages/core/src/theme/index.ts
 */

import type {DefinedTheme, TokenName} from './defineTheme';
import {generatedScopedStatusRoleDefaults} from './statusRoleDefaults';
import {tokenDefaults} from './tokenDefaults';
import {resolveTokenReferences} from './tokenReferences';
import {
  evaluateColorFunctions,
  resolveDefaultTokens,
  resolveXDSTokenValue,
  type ResolvedThemeMode,
} from './tokenValues';

export type {ResolvedThemeMode} from './tokenValues';

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

  if (theme == null) {
    return resolveDefaultTokens(mode);
  }

  for (const [key, value] of Object.entries(tokenDefaults)) {
    resolved[key] = resolveXDSTokenValue(value, mode);
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
    Object.entries(
      resolveTokenReferences(resolved, evaluateColorFunctions),
    ).filter(([key]) => !localKeys.has(key)),
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
