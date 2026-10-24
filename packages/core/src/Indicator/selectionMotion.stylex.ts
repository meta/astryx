// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectionMotion.stylex.ts
 * @input Uses StyleX
 * @output Exports `selectionMotionConsts`: the build-time mirror of
 *   `selection.mark` in motion/uikit/selection.ts
 * @position Internal styling constants; CheckboxIndicator and RadioIndicator
 *   read them for their touch presentation
 *
 * StyleX evaluates a style at build time and cannot read the constants
 * table, so this mirrors its value. selectionMotion.test.ts fails if they
 * drift.
 *
 * SYNC: When modified, update /packages/core/src/motion/uikit/selection.ts
 * and selectionMotion.test.ts.
 */

import * as stylex from '@stylexjs/stylex';

export const selectionMotionConsts = stylex.defineConsts({
  /** `selection.mark.changeMs`, in ms. */
  markChangeMs: 0,
});
