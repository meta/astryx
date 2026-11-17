// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressValues.ts
 * @input None
 * @output The UIKit value the menu press model reads
 * @position A copy of one UIKit table entry, motion/uikit gestures.ts
 *   `UIKIT_MENU_PRESS.handoff`. A menu then bundles this number, not the
 *   table with its measurement records. The table stays the source and
 *   documents the measurement. menuPressValues.test.ts fails when the copy
 *   drifts.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/uikit/gestures.ts
 */

/** How far the opening finger travels after the menu opens before it picks. */
export const MENU_PRESS_HANDOFF_PX = 10;
