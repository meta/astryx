// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressValues.ts
 * @input None
 * @output The UIKit value the menu press model reads
 * @position A copy of one entry of the UIKit tables (motion/uikit
 *   gestures.ts `UIKIT_MENU_PRESS.handoff`), so a menu bundles this number
 *   and not the table with its measurement records (architecture:component-
 *   style-authoring INV6). The table stays the source and documents the
 *   measurement; menuPressValues.test.ts fails when the copy drifts.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/uikit/gestures.ts
 */

/** How far the opening finger travels after the menu opens before it picks. */
export const MENU_PRESS_HANDOFF_PX = 10;
