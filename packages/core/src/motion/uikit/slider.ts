// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file slider.ts
 * @input Nothing; data only
 * @output Exports `slider`: UISlider's thumb hit target, its tracking rule
 *   (the value follows the pan's translation over the track's length), the
 *   release coast (spring, projection rate and share), the thumb's lift and
 *   drop springs and scale, and the end-of-track haptic. It sets no Reduce
 *   Motion mode of its own: the motion it times follows the animator's
 *   Reduced Motion policy (`design:reduced-motion`)
 * @position The slider domain of the UIKit constants table (motion/uikit);
 *   read by Slider's touch presentation (Slider/useSliderTouch.ts)
 *
 * The reference is UISlider on iOS 26.2: a white capsule thumb (37 × 24 pt,
 * a `_UILiquidLensView`) on a 6 pt track. Under a finger the thumb lifts
 * into a larger glass lens and tracks the finger's travel, not its
 * position: the value moves by the finger's travel past the pan's threshold
 * (10 pt from touch-down: the pan hysteresis in `gestures.ts`) over the
 * track's full length, so the thumb, whose travel is the track
 * minus its own width, lags the finger and never jumps to it. The value
 * clamps at the ends without a rubber band, and a finger that overshoots an
 * end must come back past it before the value moves again (the mapping is
 * absolute from the pan's start). At the lift the thumb coasts on: the value
 * springs to the lift value plus 0.4 × the release velocity's momentum
 * projection (`valueChanged` keeps firing during the coast, and `touchUp`
 * waits for its end), unless the finger lifted outside the control's
 * tracking bounds, where it springs back to the lift value. A tap on the
 * track does nothing.
 *
 * Values measured with the UIKit lab (a UIKit host app with hooks injected)
 * on the iOS 26.2 simulator, iPhone 17 Pro, real HID touches: a default
 * `UISlider` 300 pt wide, value 0…1 (a per-frame log of the
 * touches, the value, `valueChanged` and the lens's presentation frame).
 * The springs are fits of those frames (closed-form spring step, least
 * squares; rms residual per entry). Lengths are in pt (CSS px).
 *
 * Every leaf carries one or more `@source`; GUESS values also carry the
 * `@measure` task that will confirm or replace them. uikit.test.ts enforces
 * both.
 *
 * Every value is an internal constant: touch motion has no theme surface,
 * and `spec:AST-094` FR4 names no slider role.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/Slider/sliderTouchController.ts
 * - /packages/core/src/Slider/Slider.tsx
 * - /packages/core/src/motion/uikit/slider.test.ts
 */

import {SLIDER_RELEASE_SPRING} from './springs';

/**
 * UISlider's touch values: hit target, tracking, release coast, lift, drop
 * and the end-of-track haptic.
 */
export const slider = {
  /**
   * The thumb's touch target, a square in pt centered on the thumb: the
   * 37 × 24 pt thumb grown by its hit edge insets (12 pt above and below,
   * 5.5 pt left and right). UIKit hit-tests inside the control's frame
   * first, so the frame clips it: in the lab's 40 pt frame the target was
   * 48 × 40. A touch further out lands on the track, which ignores it.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `_thumbHitEdgeInsets` read as
   *   {−12, −5.5, −12, −5.5}; touch-downs on a 4 pt grid around the thumb
   *   center track from −24 to +20 pt in x (−20 to +16 pt in y inside the
   *   40 pt frame); a tap on the track away from the thumb does not move the
   *   value, Oct 23 2026
   */
  thumbHitTarget: 48,
  /**
   * Value range per track length of finger travel: the value moves by
   * (max − min) × translation ÷ the track's full length, with the
   * translation counted from the pan's threshold (the touch-down point plus
   * the 10 pt hysteresis along the track). 1 means one full range per track
   * length (UIKit's thumb travels 263 of the 300 pt for it).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, value per touch event during drags at
   *   120 to 2000 pt/s (value = v0 + translation past the 10 pt pan
   *   hysteresis ÷ 300 for every event), and a drag past the max end and
   *   back (the value leaves 1 only when the finger returns past the point
   *   where it reached 1, to 0.0001), Oct 23 2026
   */
  trackingGain: 1,
  /**
   * The coast after the lift: the thumb (and the value) spring from where
   * the finger left them, with the release velocity, to the projected
   * target. Critically damped, so it never overshoots a target ahead of it.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the `UIViewSpringAnimationBehavior` read
   *   at the lift (response 0.4, damping ratio 1); per-frame value after the
   *   lift of four releases (126.9, 95.6 outside, 151.2 and 609.9 pt/s) fits
   *   a critically damped spring of response 0.395–0.40 s started 22–38 ms
   *   after the lift with the release velocity (rms at most 0.11 pt),
   *   Oct 23 2026
   */
  releaseSpring: SLIDER_RELEASE_SPRING,
  /**
   * The deceleration rate of the coast's momentum projection, per ms
   * (WWDC18's `project`). Not UIScrollView's normal rate (0.998): pass it
   * to the projection explicitly.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the release behavior's
   *   inertial projection deceleration read as 0.996, Oct 23 2026
   */
  releaseProjectionRate: 0.996,
  /**
   * How much of the projection the coast travels: the target is the lift
   * value plus this share of the projected distance (0.0996 s × the release
   * velocity at `releaseProjectionRate`). A finger lifted outside the control's
   * tracking bounds coasts back to the lift value instead.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the release behavior's inertial target
   *   smoothing read as 0.4; a release at 126.9 pt/s travels 12.56 pt after
   *   the lift (12.64 predicted), and one 100 pt above the slider ends at
   *   the lift value, Oct 23 2026
   */
  releaseProjectionShare: 0.4,
  /**
   * The thumb's growth under a finger, uniform about its center (37 × 24 to
   * 57.35 × 37.2 pt).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, lens frame settled during an 800 ms hold,
   *   Oct 23 2026
   */
  liftScale: 1.55,
  /**
   * The lift: the thumb growing to `liftScale` when the finger lands (after
   * the scroller's content delay inside one).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, per-frame lens width during an 800 ms hold
   *   fitted with one spring (response 0.215 s, damping ratio 0.6, rms
   *   0.31 pt; peak 59.39 pt 134 ms after touch-down), Oct 23 2026
   */
  liftSpring: {response: 0.215, dampingRatio: 0.6},
  /**
   * The drop: the thumb shrinking back to its rest size when the finger
   * lifts, while the coast runs.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the lens's spring behavior read at the
   *   lift of an 800 ms hold (response 0.5 s, damping ratio 0.7: the stored
   *   value); the per-frame lens width after that lift fits one spring at
   *   response 0.49 s, damping ratio 0.70 (rms 0.10 pt; the read leaves
   *   0.20 pt; undershoot to 36.04 pt), Oct 23 2026
   */
  dropSpring: {response: 0.5, dampingRatio: 0.7},
  /**
   * The feedback each time the value reaches an end, once per entry (it
   * re-arms when the value leaves the end), during the drag and the coast.
   * UIKit plays its fluid slider generator's "Micro Tap Medium"; the web
   * stand-in is the closest kind.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, haptics log of drags into and out of both
   *   ends: `_UIFluidSliderFeedbackGenerator` "Micro Tap Medium", three hits
   *   on three entries at the max, one at the min, Oct 23 2026
   */
  endHaptic: 'impactMedium',
} as const;
