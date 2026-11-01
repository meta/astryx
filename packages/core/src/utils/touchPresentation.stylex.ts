// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchPresentation.stylex.ts
 * @input Uses StyleX defineConsts
 * @output Exports touchKeys: the touch presentation resolver's queries as
 *   StyleX at-rule keys
 * @position The reference spellings of the touch, compact and iOS-gate
 *   conditions. Core styles write these as literal keys wherever they need
 *   them (`spec:AST-094` FR13, `spec:AST-012` FR9), and a test pins each
 *   literal to these values; utils/touchPresentation.ts holds the same
 *   queries for script (matchMedia)
 *
 * These are the spellings to match. A style that changes with these
 * conditions writes the same literal key (`'@media (pointer: coarse)'`, the
 * iOS gate as that media key outside `'@supports (-webkit-touch-callout:
 * none)'`), and a test pins every literal in core to these values. Do not use
 * an imported key as a computed StyleX key: it compiles to a different
 * priority than the literal (6000 against 3200) and reorders the cascade.
 * The iOS supports gate is only for a style iOS WebKit itself requires (the
 * 16px input floor), never a behaviour.
 *
 * SYNC: When modified, update touchPresentation.ts and
 * touchPresentation.test.ts.
 */

import * as stylex from '@stylexjs/stylex';

export const touchKeys = stylex.defineConsts({
  /** The primary pointer is coarse (TOUCH_QUERY). */
  touch: '@media (pointer: coarse)',
  /** The viewport is compact (COMPACT_QUERY, `spec:AST-012` FR9). */
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
