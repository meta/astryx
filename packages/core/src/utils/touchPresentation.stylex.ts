// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchPresentation.stylex.ts
 * @input Uses StyleX defineConsts
 * @output Exports touchKeys: the touch presentation resolver's queries as
 *   StyleX at-rule keys
 * @position The reference spellings of the touch, compact and iOS-gate
 *   conditions. utils/touchPresentation.ts holds the same queries for script.
 *
 * SYNC: When modified, update touchPresentation.ts and
 * touchPresentation.test.ts.
 */

// Core styles write these as literal keys (AST-012), and a test pins each
// literal to these values. Do not use an imported key as a computed StyleX key:
// it gets a different priority than the literal (6000 against 3200) and
// reorders the cascade. The iOS supports gate is only for a style that iOS
// WebKit requires (the 16px input floor), never for a behavior (AST-094).

import * as stylex from '@stylexjs/stylex';

export const touchKeys = stylex.defineConsts({
  /** The primary pointer is coarse (TOUCH_QUERY). */
  touch: '@media (pointer: coarse)',
  /** The viewport is compact (COMPACT_QUERY). */
  compact: '@media (width < 768px), (height < 500px)',
  /** Both: a presentation such as a sheet in place of a popover. */
  compactTouch:
    '@media (width < 768px) and (pointer: coarse), (height < 500px) and (pointer: coarse)',
  /**
   * The iOS WebKit gate, inside `touch` (IOS_SUPPORTS_QUERY): only for a
   * style iOS WebKit itself requires (the 16px input floor), never a
   * behaviour; touch behaviour is one model on every touch device.
   */
  iosSupports: '@supports (-webkit-touch-callout: none)',
});
