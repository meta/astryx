// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reorderHandle.stylex.ts
 * @input Nothing: StyleX constants
 * @output `reorderHandle`, the reorder handle's sizes: its grip's box and how
 *   far its target reaches past the grip, for a fine pointer and for a finger
 * @position The one place these sizes live. Core List's handle draws with
 *   them, and ListInput and Lab's TransferList keep the handle's room with
 *   them. StyleX reads them at build time, so a value is written out in full.
 */

import * as stylex from '@stylexjs/stylex';

export const reorderHandle = stylex.defineConsts({
  /** The grip's box. A theme's icon size changes only the icon inside it. */
  grip: '1rem',
  /** How far a fine pointer's target reaches past the grip: to 24px, and at least 4px. */
  targetReach: 'max(4px, (24px - 1rem) / 2)',
  /**
   * How far a finger's target reaches past the grip: half of what the grip
   * leaves of utils/hitArea.ts MIN_TOUCH_TARGET (44px). A test holds the two
   * together.
   */
  touchReach: 'calc((44px - 1rem) / 2)',
});
