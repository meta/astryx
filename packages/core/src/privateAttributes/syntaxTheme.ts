// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/syntaxTheme.ts
 * @input The name of a SyntaxTheme's syntax theme.
 * @output The attribute SyntaxTheme writes on its wrapper, and the selector
 *   text the theme engine uses to keep the built-in syntax token rule out of
 *   a SyntaxTheme.
 * @position Owner module of the private syntax-theme attribute.
 *   theme/syntax/SyntaxTheme.tsx writes it; theme/syntax/tokens.ts
 *   reads it. No package entry exports it.
 */

const SYNTAX_THEME = 'data-astryx-syntax-theme';

/** The attribute for a SyntaxTheme wrapper. */
export function syntaxThemeAttribute(name: string): Record<string, string> {
  return {[SYNTAX_THEME]: name};
}

/** Matches a SyntaxTheme wrapper. */
export function syntaxThemeSelector(): string {
  return `[${SYNTAX_THEME}]`;
}
