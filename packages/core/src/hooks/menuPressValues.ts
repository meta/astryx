// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressValues.ts
 * @input None
 * @output The three UIKit values the menu press model reads
 * @position Copies of three UIKit table entries: motion/uikit gestures.ts
 *   `UIKIT_MENU_PRESS.holdOpenSlop` and `.handoff`, and scroll.ts
 *   `delaysContentTouchesMs`. A menu then bundles these numbers, not the
 *   tables with their measurement records. The tables stay the source and
 *   document the measurements. menuPressValues.test.ts fails when a copy
 *   drifts.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/uikit/gestures.ts
 * - /packages/core/src/motion/uikit/scroll.ts
 */

/** How far a finger may drift on a trigger in a scroll view and still open its menu. */
export const MENU_PRESS_HOLD_OPEN_SLOP_PX = 13;

/** How far the opening finger travels after the menu opens before it picks. */
export const MENU_PRESS_HANDOFF_PX = 10;

/** UIScrollView's content-touch delay. */
export const DELAYS_CONTENT_TOUCHES_MS = 150;
