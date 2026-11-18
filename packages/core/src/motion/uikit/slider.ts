// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file slider.ts
 * @input Nothing: data only
 * @output Exports `slider`: UISlider's hit target, tracking rule, release
 *   coast, lift, drop and end haptic, measured on the iOS 26.2 simulator
 * @position The slider domain of the UIKit constants table (motion/uikit).
 *   Lengths are in pt (CSS px). Tests check each leaf's `@source`.
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
   * The thumb's touch target, a square in pt centered on the thumb. It is
   * the 37 × 24 pt thumb grown by its hit edge insets: 12 pt above and
   * below, 5.5 pt left and right. UIKit hit-tests inside the control's frame
   * first, so the lab's 40 pt frame clipped it to 48 × 40.
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro.
   *   `_thumbHitEdgeInsets` reads {−12, −5.5, −12, −5.5}. Touch-downs on a
   *   4 pt grid take the thumb from −24 to +20 pt in x. A track tap away
   *   from the thumb moves nothing. Oct 23 2026
   */
  thumbHitTarget: 48,
  /**
   * Value range per track length of finger travel. The value moves by
   * (max − min) × translation ÷ the track's full length. The translation
   * counts from the pan's threshold: the touch-down point plus 10 pt along
   * the track. 1 means one full range per track length.
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro. In
   *   drags at 120 to 2000 pt/s, each event's value is v0 plus the
   *   translation past 10 pt ÷ 300. Past the max end, the value leaves 1
   *   only once the finger comes back past where it reached 1. Oct 23 2026
   */
  trackingGain: 1,
  /**
   * The coast after the lift. The thumb and the value spring from where the
   * finger left them to the projected target, with the release velocity.
   * Critically damped, it never overshoots a target ahead of it.
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro. The
   *   `UIViewSpringAnimationBehavior` at the lift reads response 0.4 and
   *   damping ratio 1. Four releases fit it per frame, at rms 0.11 pt or
   *   less. Oct 23 2026
   */
  releaseSpring: SLIDER_RELEASE_SPRING,
  /**
   * The deceleration rate of the coast's momentum projection, per ms
   * (WWDC18's `project`). It is not UIScrollView's normal rate (0.998), so
   * pass it to the projection explicitly.
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro. The
   *   release behavior's projection deceleration reads 0.996. Oct 23 2026
   */
  releaseProjectionRate: 0.996,
  /**
   * How much of the projection the coast travels. The target is the lift
   * value plus this share of the projected distance. A finger lifted outside
   * the control's tracking bounds coasts back to the lift value instead.
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro. The
   *   release behavior's target smoothing reads 0.4. A 126.9 pt/s release
   *   travels 12.56 pt, against 12.64 predicted. Oct 23 2026
   */
  releaseProjectionShare: 0.4,
  /**
   * The thumb's growth under a finger, uniform about its center (37 × 24 to
   * 57.35 × 37.2 pt).
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro. The lens
   *   frame settled during an 800 ms hold. Oct 23 2026
   */
  liftScale: 1.55,
  /**
   * The lift: the thumb grows to `liftScale` when the finger lands.
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro. The lens
   *   width per frame in an 800 ms hold fits one spring at rms 0.31 pt.
   *   Oct 23 2026
   */
  liftSpring: {response: 0.215, dampingRatio: 0.6},
  /**
   * The drop: the thumb shrinks back to its rest size when the finger lifts,
   * while the coast runs.
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro. The
   *   lens's spring at the lift of an 800 ms hold reads response 0.5 s and
   *   damping ratio 0.7. The width per frame fits it at rms 0.10 pt.
   *   Oct 23 2026
   */
  dropSpring: {response: 0.5, dampingRatio: 0.7},
  /**
   * The feedback each time the value reaches an end, once per entry. It
   * re-arms when the value leaves the end, in the drag and the coast. UIKit
   * plays "Micro Tap Medium", and the web stand-in is the closest kind.
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro. The
   *   haptics log of drags into both ends shows the fluid slider generator's
   *   "Micro Tap Medium" once per entry. Oct 23 2026
   */
  endHaptic: 'impactMedium',
} as const;
