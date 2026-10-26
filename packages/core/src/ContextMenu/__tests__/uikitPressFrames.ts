// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file uikitPressFrames.ts
 * @input Nothing; measured data only
 * @output Exports the visible scale of UIKit's context-menu press platter,
 *   frame by frame, for a long press and for a press lifted before the
 *   commit, as the reference the press feedback is compared against
 * @position Test-only fixture of packages/core/src/ContextMenu (excluded from
 *   the build with the rest of __tests__); read by the unit and interaction
 *   tests of the press feedback
 *
 * UIKit lab (injected host app), iOS 26.2 simulator, iPhone 17 Pro, Oct 23
 * 2026: the presentation width of `_UIContentPlatterView` over a 200 × 120 pt
 * view, divided by 200, at each frame's display time in ms from the main
 * thread's receipt of the touch.
 */

/** The measured view's width, to read scale errors in points. */
export const UIKIT_PRESS_VIEW_WIDTH = 200;

/** A long press: the menu displayed at 734 ms. */
export const UIKIT_LONG_PRESS: ReadonlyArray<readonly [number, number]> = [
  [199.6, 1],
  [215.9, 1.00014],
  [232.5, 1.00047],
  [249.2, 1.00109],
  [265.9, 1.00203],
  [282.5, 1.00331],
  [299.2, 1.00492],
  [315.9, 1.00682],
  [332.7, 1.00907],
  [349.2, 1.01159],
  [366.1, 1.01424],
  [382.5, 1.01699],
  [399.2, 1.01988],
  [415.8, 1.02286],
  [432.5, 1.02581],
  [449.2, 1.02877],
  [466.6, 1.03168],
  [483.1, 1.03444],
  [499.2, 1.03703],
  [515.8, 1.03944],
  [532.9, 1.04173],
  [554.4, 1.04388],
  [565.8, 1.04586],
  [583, 1.0477],
  [599.2, 1.04944],
  [615.8, 1.05111],
  [632.5, 1.0527],
  [649.2, 1.05425],
  [666.5, 1.05577],
  [682.5, 1.05727],
  [699.2, 1.05878],
  [716.1, 1.06029],
  [732.6, 1.06183],
];

/** When the early press lifted, ms (main-thread receipt). */
export const UIKIT_EARLY_LIFT_AT = 266.5;

/** A press lifted before the commit: no menu, the platter springs back. */
export const UIKIT_EARLY_LIFT: ReadonlyArray<readonly [number, number]> = [
  [199.5, 1],
  [216.1, 1.00014],
  [232.7, 1.00046],
  [249.4, 1.00107],
  [267.3, 1.002],
  [282.8, 1.00327],
  [299.5, 1.00438],
  [316.1, 1.00493],
  [332.8, 1.00504],
  [349.5, 1.00483],
  [366.1, 1.0044],
  [382.8, 1.00382],
  [399.4, 1.00318],
  [416.1, 1.00252],
  [432.8, 1.00189],
];
