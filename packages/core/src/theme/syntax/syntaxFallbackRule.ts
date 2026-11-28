// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file syntaxFallbackRule.ts
 * @input syntaxTokenDefaults, the theme-colors and syntax-theme selectors
 * @output syntaxFallbackRule, the CSS rule that declares the built-in syntax
 *   tokens
 * @position Theme engine; CodeBlock and CodeEditor inject the rule through
 *   CodeBlock/highlightStyles.ts
 */

import {syntaxThemeSelector} from '../../privateAttributes/syntaxTheme';
import {themeColorsSelector} from '../../privateAttributes/themeColors';
import {syntaxTokenDefaults} from './tokens';

/**
 * The rule that declares the built-in syntax tokens. Each one refers to a Core
 * color token, and a custom property resolves where it is declared. So the
 * rule declares them at the page root and again on each Theme wrapper whose
 * theme sets Core color tokens: code there takes that theme's colors. A
 * wrapper inside a SyntaxTheme does not match, so the SyntaxTheme's tokens
 * still reach the code in it. A theme's own syntax tokens are in a later
 * layer, so they still win.
 */
export function syntaxFallbackRule(): string {
  const declarations = Object.entries(syntaxTokenDefaults)
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `:root, ${themeColorsSelector()}:not(${syntaxThemeSelector()} *) {\n${declarations}\n}`;
}
