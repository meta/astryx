// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file segmented.ts
 * @input Nothing; data only
 * @output Exports `segmentedControl`, UISegmentedControl's selection slide
 *   spring, its drag overshoot and its lift; and `registerSegmentedTable`,
 *   which registers the two springs as internal motion roles
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
 * UIKit's lens also stretches along a slide; that stretch is not modeled.
 * The lens chases a dragging finger on the shared `springs.fingerTracking`
 * role, which matches the values UIKit reports for this control. A flick
 * carries the selection no further than a slow drag: UIKit projects no
 * flick, so the release position alone decides.
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
  /**
   * How much a finger's press on the selected segment grows the lens, in pt
   * (width, height). The growth is the same at every control size.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, per-frame lens bounds of a held selected segment:
   *   96 × 27 to 120 × 43 (three segments), 71 × 27 to 95 × 43 (four
   *   segments), 126 × 40 to 150 × 56 (a 390 × 44 control), Oct 23 2026
   */
  liftGrowth: [24, 16],
  /**
   * The lens growing by `liftGrowth` under a finger that presses the
   * selected segment, and shrinking back after the release. It is critically
   * damped and reaches 99 % in about 0.27 s.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIViewSpringAnimationBehaviorSettings read on the lens
   *   while it lifts and settles (dampingRatio 1.0, response 0.25),
   *   Oct 23 2026
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, per-frame lens bounds of a 600 ms hold of the selected
   *   segment, spring fit with (1.0, 0.25): lift rms 0.16 pt (width) and
   *   0.13 pt (height), settle rms 0.05 pt and 0.03 pt, each starting about
   *   16 ms after the touch event, Nov 2 2026
   */
  lift: {response: 0.25, dampingRatio: 1},
} as const;

/**
 * Registers this table with the motion registry (motion/roles.ts). The
 * slide's and the lift's springs become internal motion roles. The drag
 * overshoot and the lift's growth are not motion, so they stay internal
 * constants. Nothing registers on import, and a second call does nothing.
 */
export function registerSegmentedTable(): void {
  registerMotionTable('segmented', segmentedControl, {
    roles: ['selectionSpring', 'lift'],
  });
}
