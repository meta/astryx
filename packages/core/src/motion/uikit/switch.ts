// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file switch.ts
 * @input The springs table's measured switch travel (springs.ts)
 * @output Exports `switchControl`: UISwitch's geometry, the springs of its
 *   Liquid Glass thumb and of its track color, the drag's rubber band and
 *   flip distance, and the release timing
 * @position The switch domain of the UIKit constants table (motion/uikit)
 *
 * The values are UISwitch's on iOS 26.2, read in a UIKit host app on the
 * simulator. Lengths are in pt (CSS px). uikit.test.ts checks each `@source`.
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md.
 */

import {registerMotionTable} from '../roles';
import {SWITCH_THUMB_MOVE_SPRING} from './springs';

/**
 * UISwitch on iOS 26.2. Under a finger its white thumb lifts into a clear
 * glass lens, and a drag moves it with a rubber band. The track colour slides
 * on a spring of its own. UISwitch plays no haptic.
 */
export const switchControl = {
  /**
   * The control's size (width × height): the track.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `UISwitch` frame 63 × 28 (intrinsic 61 × 28), track view
   *   63 × 28 with corner radius 14, Oct 23 2026
   */
  trackSize: [63, 28],
  /**
   * The thumb at rest (width × height), inset equally from the track's top,
   * bottom and nearer end; it never changes size between off and on.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `_UILiquidLensView` frame 37 × 24 at x 2 (off) and
   *   x 24 (on) inside the 63 × 28 track, Oct 23 2026
   */
  thumbSize: [37, 24],
  /**
   * The thumb lifted under a finger (width × height). The lens grows about
   * its own center, past the track, and holds this size while the finger
   * stays down.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, lens bounds settled at 58 × 38.33 during a 1 s hold
   *   (center unmoved), Oct 23 2026
   */
  liftedThumbSize: [58, 38.333],
  /**
   * The lift: the thumb growing to `liftedThumbSize` while its white fill
   * fades out and the clear glass fades in (one spring drives all three).
   * Starts with the touch outside a scroll view, after its content delay
   * inside one. UISwitch keeps it under Reduce Motion; core's Switch does not
   * lift then.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, per-frame lens bounds during a 1 s hold fitted with one
   *   spring for width and height (rms 0.29 pt; the fill's and the glass's
   *   opacity overshoot by the same 13 %; the lens's settings read on a tap
   *   say damping 0.625, response 0.27, whose 8 % overshoot is short of the
   *   frames' 12 %), Oct 23 2026
   */
  lift: {response: 0.23, dampingRatio: 0.55},
  /**
   * The settle after the finger lifts: the lens shrinking back to
   * `thumbSize` while the white fill returns over the glass.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the lens's spring settings read on a tap (damping 0.7,
   *   response 0.5); per-frame lens bounds after the lift of a 1 s hold fit
   *   one spring at 0.49 / 0.70 (rms 0.065 pt; the opacities undershoot by
   *   the same 4.5 %), Oct 23 2026
   */
  settle: {response: 0.5, dampingRatio: 0.7},
  /**
   * The settle never starts sooner than this after the lift began, so a
   * quick tap still shows the lifted lens, in ms.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, a 50 ms tap: the lift→settle hand-off fitted at 235 ms
   *   after the lift began (rms 0.33 pt), Oct 23 2026
   * @measure M-SW07
   */
  minimumLiftMs: 235,
  /**
   * The thumb travelling to the committed end after a release or a
   * programmatic change. It starts from the thumb's own velocity.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the lens's position behavior read on a tap (damping 1,
   *   response 0.3); the lens center after a 50 ms tap and after a 1 s hold
   *   fits one spring at 0.31 / 1 (rms 0.11 pt), Oct 23 2026; the springs
   *   table's `SWITCH_THUMB_MOVE_SPRING` holds the one value
   */
  travel: SWITCH_THUMB_MOVE_SPRING,
  /**
   * During a drag the thumb chases the finger: each move retargets this
   * spring at the finger's position, rubber-banded past either end.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, a 4 s drag off → on → past both ends: the lens center
   *   simulated as this spring chasing the rubber-banded finger fits every
   *   frame (rms 0.21 pt), Oct 23 2026
   */
  tracking: {response: 0.36, dampingRatio: 1},
  /**
   * The drag's rubber band past either end: UIScrollView's
   * `(1 − 1 ÷ (x·c ÷ d + 1))·d`. The coefficient c and the dimension d are in
   * pt for the 28 pt control. Scale d with the track height.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the same drag fit: c 0.55, d 11.75–12 pt, the
   *   translation measured from where the finger landed, Oct 23 2026
   */
  rubberBand: {coefficient: 0.55, dimension: 12},
  /**
   * A drag flips the switch by the finger, not the thumb. Once the finger is
   * this far from where it landed, toward the other end, the switch shows
   * the other side. The distance is the track width minus the thumb width
   * (63 − 37 pt). Back past where it landed, the starting side shows again.
   * Flips happen on touch events only, so a fast swipe flips on the lift.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `UISwitchModernVisualElement` ivars per frame and the
   *   "SwitchWellPosition" springs during 1 pt-step drags: the same 26 pt for
   *   presses at x 8, 20.5 and 45, with and without a 400 ms hold, mirrored
   *   on an on switch; flipping back at the press point, Oct 23 2026
   */
  flipDistance: 26,
  /**
   * The track color turning on: the well image sliding in on a critically
   * damped spring, starting when the switch flips (the lift of a tap).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `CASpringAnimation` "SwitchWellPosition" read: mass 1,
   *   stiffness 85.377, damping 18.480 (response 0.68 s), Oct 23 2026
   */
  wellOn: {mass: 1, stiffness: 85.37720070146501, damping: 18.47995678582231},
  /**
   * The track color turning off: the same well sliding back, faster.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `CASpringAnimation` "SwitchWellPosition" read: mass 1,
   *   stiffness 246.740, damping 31.416 (response 0.40 s), Oct 23 2026
   */
  wellOff: {mass: 1, stiffness: 246.74011002723395, damping: 31.41592653589793},
  /**
   * The lifted lens's drop shadow: y offset and radius in pt, then black
   * alpha; none at rest.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the lens layer's presented `shadowOffset` (0, 7),
   *   `shadowRadius` 3, `shadowOpacity` 0.12 once lifted, 0 at rest,
   *   Oct 23 2026
   */
  liftedShadow: [7, 3, 0.12],
  /**
   * UISwitch plays no haptic on a tap, a hold or a drag.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, every `UIFeedbackGenerator` entry point hooked: no call
   *   on tap, hold, drag or flip, Oct 23 2026
   */
  haptic: 'none',
} as const;

/**
 * Registers the switch table's motion roles as internal roles. Nothing
 * registers on import: Switch's touch presentation calls it once before its
 * first animation, and a second call does nothing.
 */
export function registerSwitchTable(): void {
  registerMotionTable('switchControl', switchControl, {
    roles: [
      'lift',
      'settle',
      'travel',
      'tracking',
      'wellOn',
      'wellOff',
      'minimumLiftMs',
    ],
  });
}
