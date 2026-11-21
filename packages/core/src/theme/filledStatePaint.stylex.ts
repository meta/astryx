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
  '--_button-primary-hover': 'light-dark(#00000017, #00000014)',
  '--_button-primary-pressed': 'light-dark(#00000029, #00000026)',
  '--_button-secondary-hover': 'light-dark(#0A13170D, #00000026)',
  '--_button-secondary-pressed': 'light-dark(#0A131717, #0000004A)',
  '--_button-destructive-hover': 'light-dark(#00000017, #FFFFFF12)',
  '--_button-destructive-pressed': 'light-dark(#0000002B, #FFFFFF24)',
});
