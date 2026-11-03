// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file progressBar.ts
 * @input Nothing: data only
 * @output Exports `progressBar` (UIProgressView's fill: the whole-track
 *   duration and curve, its minimum length and its empty alpha) and
 *   `registerProgressBarTable`
 * @position ProgressBar's rows of the UIKit constants table (motion/uikit).
 *   Lengths are in pt (CSS px), durations in ms, alphas in 0..1. Tests check
 *   each leaf's `@source`.
 *
 * SYNC: When modified, update
 * /packages/core/src/ProgressBar/ProgressBarTouch.ts and
 * /packages/core/src/ProgressBar/ProgressBar.test.tsx.
 */

import {registerMotionTable} from '../roles';

/**
 * UIProgressView's values, for ProgressBar. Two values are motion roles in the
 * generated motion role table: the whole-track duration,
 * `progress.fillTrackMs`, and its curve, `progress.curves.fill`. Every other
 * value is an internal constant.
 */
export const progressBar = {
  /**
   * setProgress(_:animated: true) runs this long for a change of the whole
   * track (0 → 1). A smaller change runs in proportion, measured on the model
   * values: 0.2 → 0.8 takes 0.6 s. A retargeted fill starts from wherever it
   * is drawn.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIView animation on the fill's frame (duration,
   *   beginFromCurrentState) for jumps of 0.6, 0.4 and 0.6, Oct 23 2026
   */
  fillTrackMs: 1000,
  curves: {
    /**
     * That animation's curve: linear, and Reduce Motion leaves it unchanged.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, the fill's position animation (timing function
     *   linear), with Reduce Motion off and on, Oct 23 2026
     */
    fill: [0, 0, 1, 1],
  },
  progressView: {
    /**
     * The track's height in the `.default` style; the fill is as tall.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, intrinsic size of UIProgressView(progressViewStyle:
     *   .default), Oct 23 2026
     */
    heightPt: 4,
    /**
     * Above zero progress, the fill is never narrower than this many track
     * heights: 8 pt on the 4 pt track. At 0.005 of a 300 pt track it is 8 pt
     * wide; at 0.05 it is 15 pt.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, the fill image view's frame at progress 0, 0.005,
     *   0.01, 0.05, 0.5 and 1, Oct 23 2026
     */
    minimumFillHeights: 2,
    /**
     * At progress 0 the fill is transparent (alpha 0, still at its minimum
     * width).
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, the fill image view's alpha at progress 0, Oct 23 2026
     */
    emptyFillAlpha: 0,
  },
} as const;

/**
 * Registers the table's two roles, for the generated motion role table and its
 * test, which call it. Nothing at runtime reads the registry: `resolveMotion`
 * returns the table value. Idempotent, and nothing runs on import.
 */
export function registerProgressBarTable(): void {
  registerMotionTable('progress', progressBar, {
    roles: ['fillTrackMs', 'curves.fill'],
  });
}
