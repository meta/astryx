// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Core's hover and pressed paint for each filled Button variant
 * @input filledStatePaint.ts, run on Core's default tokens
 * @output Private `--_button-<variant>-<state>` variables with Core's values;
 *   a theme that sets a colour they read emits its own (generateThemeRules)
 * @position Read by Button's filled variants. filledStatePaint.test.ts holds
 *   these values to the derivation. It sits in the theme layer because its
 *   values are per-mode `light-dark()` pairs.
 */

import * as stylex from '@stylexjs/stylex';

export const filledStatePaintVars = stylex.defineVars({
  '--_button-primary-hover': 'light-dark(#0000001F, #0000001C)',
  '--_button-primary-pressed': 'light-dark(#0000003D, #00000038)',
  '--_button-secondary-hover': 'light-dark(#0A13170F, #00000036)',
  '--_button-secondary-pressed': 'light-dark(#0A13171F, #0000006B)',
  '--_button-destructive-hover': 'light-dark(#0000001F, #FFFFFF1A)',
  '--_button-destructive-pressed': 'light-dark(#0000003D, #FFFFFF33)',
});
