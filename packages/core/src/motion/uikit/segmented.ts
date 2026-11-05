// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file segmented.ts
 * @input Nothing; data only
 * @output Exports `segmentedControl`, UISegmentedControl's selection slide
 *   spring and its drag overshoot; and `registerSegmentedTable`, which
 *   registers the spring as an internal motion role
 * @position The segmented-control domain of the UIKit constants table
 *   (motion/uikit); read by SegmentedControl's touch presentation
 *
 * SYNC: When modified, update:
 * - /packages/core/src/SegmentedControl/useSegmentedSelectionMotion.ts
 * - /packages/core/src/motion/README.md (domain list)
 */

import {registerMotionTable} from '../roles';

/**
 * UIKit's own UISegmentedControl, measured with three text segments in a
 * 300 × 31 pt control. A tap and a programmatic change follow the same
 * spring. Every leaf carries a `@source`, and uikit.test.ts checks it.
 *
 * Some UIKit motion is left out on purpose. UIKit cross-fades the two titles
 * that change, over 0.2 s. Astryx switches them at once, because a
 * cross-fade needs a second copy of each title. Under Reduce Motion, UIKit's
 * lens fades in at the new segment and scales from 0.88. Astryx allows no
 * scaling there, so the animator's Reduce Motion cross-fade replaces it.
 * UIKit's lens also lifts and stretches under a finger. A theme role owns
 * the lift, and the stretch is not modeled. The lens chases a dragging
 * finger on the shared `springs.fingerTracking` role, which matches the
 * values UIKit reports for this control.
 */
export const segmentedControl = {
  /**
   * The selection indicator's slide from the old segment to the new one,
   * after a tap or a programmatic change. Its response is 0.40 s and its
   * damping ratio 0.85. That gives about 1.25 pt of overshoot on a 200 pt
   * move, settled by about 0.6 s. The width follows the same spring when the
   * segments differ in width.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIViewSpringAnimationBehavior read on the lens position
   *   for a tap and a programmatic set (dampingRatio 0.85, response 0.40,
   *   tracking off), Oct 23 2026
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, per-frame log of the lens's presentation position and
   *   velocity (method C) for a tap, a programmatic set and an animated set,
   *   least-squares spring fit (response 0.395 / 0.405 / 0.400 s, damping
   *   ratio 0.855 / 0.845 / 0.850, rms at most 0.65 pt over 200 pt),
   *   Oct 23 2026
   */
  selectionSpring: {response: 0.4, dampingRatio: 0.85},
  /**
   * How far past the first or last segment's center the lens follows a
   * dragging finger, in pt. Beyond that, the lens stays put while the finger
   * goes on.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, a drag 60 pt past the last segment: the lens stops about
   *   11 pt past its center (312 vs 301), Oct 23 2026
   */
  dragOvershoot: 11,
} as const;

/**
 * Registers this table with the motion registry (motion/roles.ts). The
 * slide's spring becomes an internal motion role. The drag overshoot is not
 * motion, so it stays an internal constant. Nothing registers on import, and
 * a second call does nothing.
 */
export function registerSegmentedTable(): void {
  registerMotionTable('segmented', segmentedControl, {
    roles: ['selectionSpring'],
  });
}
