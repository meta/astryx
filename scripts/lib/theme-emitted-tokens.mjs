// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme-emitted-tokens.mjs
 * @input A defined theme
 * @output The custom properties its generated root rule declares
 * @position Shared by the repo-level colour guards so they check the tokens a
 *   theme actually emits, including roles theme generation derives
 *   (architecture:theme-compilation INV17) and scoped aliases (INV16).
 */

import {generateThemeRules} from '../../packages/core/dist/theme/index.js';

/** `{name: value}` for every declaration in the theme's root token rule. */
export function emittedRootTokens(theme) {
  const [root = ''] = generateThemeRules(theme);
  const body = root.slice(root.indexOf('{') + 1, root.lastIndexOf('}'));
  const tokens = {};
  for (const match of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    tokens[match[1]] = match[2].trim();
  }
  return tokens;
}

/** The theme with its emitted root tokens merged under its authored ones. */
export function withEmittedTokens(theme) {
  return {...theme, tokens: {...emittedRootTokens(theme), ...theme.tokens}};
}
