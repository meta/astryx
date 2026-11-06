// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file longPress.ts
 * @input Nothing
 * @output Exports LONG_PRESS_DURATION_MS and LONG_PRESS_ALLOWABLE_MOVEMENT_PX
 * @position The one source of the long-press numbers. The constants table's
 *   `longPress` entries (gestures.ts, which carry the sources) take their
 *   values from here, and so do `useLongPress` and `useMenuPress`, which
 *   import only this module: a menu does not pay for the whole gestures
 *   table.
 *
 * SYNC: When modified, update longPress.test.ts.
 */

/**
 * How long a finger rests before a long press begins, in ms:
 * `UILongPressGestureRecognizer.minimumPressDuration` (see
 * `UIKIT_GESTURES.longPress.minimumPressDuration` for the source).
 */
export const LONG_PRESS_DURATION_MS = 500;

/**
 * How far the finger may travel from where it landed before a pending long
 * press fails, in px, as a distance:
 * `UILongPressGestureRecognizer.allowableMovement` (see
 * `UIKIT_GESTURES.longPress.allowableMovement` for the source).
 */
export const LONG_PRESS_ALLOWABLE_MOVEMENT_PX = 10;
