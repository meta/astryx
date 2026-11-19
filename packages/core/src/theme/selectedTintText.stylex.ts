// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core's secondary text on the accent tint
 * @input selectedTintText.ts, run on Core's default tokens
 * @output The private `--_selected-text-secondary` variable with Core's
 *   value, and Core's value inside each Card variant; a theme that sets a
 *   colour it reads emits its own (generateThemeRules)
 * @position Read by every part that paints the accent tint behind secondary
 *   text; Card sets the variant values. selectedTintText.test.ts holds every
 *   value to the derivation.
 */

import * as stylex from '@stylexjs/stylex';

export const selectedTintTextVars = stylex.defineVars({
  '--_selected-text-secondary': 'light-dark(#4A5C6B, #B0B5BB)',
});

/**
 * Core's value inside each Card variant, measured on that variant's fill.
 * Card points `--_selected-text-secondary` at its variant's entry; a theme
 * that sets a colour the measurement reads, or a variant's fill, writes its
 * own entries on its root, so a Theme nested inside it inherits them.
 */
export const selectedTintCardVars = stylex.defineVars({
  '--_selected-text-secondary-default': 'light-dark(#4A5C6B, #B0B5BB)',
  '--_selected-text-secondary-muted': 'light-dark(#455766, #B0B5BB)',
  '--_selected-text-secondary-blue': 'light-dark(#3C4E5C, #B7BCC2)',
  '--_selected-text-secondary-cyan': 'light-dark(#405260, #BFC4CA)',
  '--_selected-text-secondary-gray': 'light-dark(#334452, #BCC1C8)',
  '--_selected-text-secondary-green': 'light-dark(#415361, #C0C5CB)',
  '--_selected-text-secondary-orange': 'light-dark(#3F515F, #B9BEC4)',
  '--_selected-text-secondary-pink': 'light-dark(#3C4D5C, #B3B8BE)',
  '--_selected-text-secondary-purple': 'light-dark(#3C4E5C, #B5BBC1)',
  '--_selected-text-secondary-red': 'light-dark(#384A58, #B0B5BB)',
  '--_selected-text-secondary-teal': 'light-dark(#415361, #C1C6CC)',
  '--_selected-text-secondary-yellow': 'light-dark(#425462, #BFC4CA)',
});
