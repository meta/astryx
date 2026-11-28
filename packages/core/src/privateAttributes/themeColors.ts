// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/themeColors.ts
 * @input Whether a Theme wrapper's theme sets Core color tokens.
 * @output The attribute Theme writes on such a wrapper, and the selector text
 *   the theme engine scopes the built-in syntax token rule to.
 * @position Owner module of the private theme-colors attribute.
 *   theme/Theme.tsx writes it; theme/syntax/tokens.ts reads it.
 *   No package entry exports it.
 */

const THEME_COLORS = 'data-astryx-theme-colors';

/** The attribute for a Theme wrapper, set only when its theme sets colors. */
export function themeColorsMarkProps(
  setsColors: boolean,
): Record<string, string> {
  return setsColors ? {[THEME_COLORS]: ''} : {};
}

/** Matches a Theme wrapper whose theme sets Core color tokens. */
export function themeColorsSelector(): string {
  return `[${THEME_COLORS}]`;
}
