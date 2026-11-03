// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file menuPressContinuation.geometry.ts
 * @input Nothing; data only
 * @output The menu-press continuation fixture's timing and layout: the hold
 *   before the menu opens, the rows' height and labels
 * @position Shared by menuPressContinuation.fixture.tsx and the interaction
 *   spec, which aims at row centers from it without loading the fixture's
 *   component code
 */

/** How long the finger rests on the button before the menu opens, ms. */
export const CONTINUED_PRESS_HOLD_MS = 500;
/** The button's and each row's height, px. */
export const CONTINUED_PRESS_ROW_PX = 44;
export const CONTINUED_PRESS_ROWS: ReadonlyArray<string> = [
  'Alpha',
  'Bravo',
  'Charlie',
];
