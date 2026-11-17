// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file focusOutlineInternal.stylex.ts
 * @input Uses StyleX and the focus variables focusOutline.stylex.ts publishes
 * @output Exports internal focus-outline variants that are not public API
 * @position Internal utility beside focusOutline.stylex.ts; no package entry
 *   or barrel exports it
 */

import * as stylex from '@stylexjs/stylex';

export const focusOutlineInternalStyles = stylex.create({
  /**
   * Rings only from the variables an ancestor publishes with
   * `focusOutlineStyles.publishFocusVisibleVars`, never from focus on a
   * descendant: for a row with no action of its own, whose inner controls
   * ring themselves. One focus move shows one ring.
   */
  published: {
    outline: 'var(--_focus-outline, none)',
    outlineOffset: 'var(--_focus-outline-offset, 0)',
  },
});
