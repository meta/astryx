// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file navigation.ts
 * @input Nothing; data only
 * @output Exports `navigation`: UINavigationController's push / pop geometry,
 *   starting velocity, dimming, transition clock and the interactive pop's
 *   finish rule
 * @position The navigation domain of the UIKit constants table
 *   (motion/uikit); its springs are `springs.navigationPush`,
 *   `springs.navigationPop`, `springs.navigationInteractivePopFinish` and
 *   `springs.navigationBarElements`
 *
 * On iOS 26.2 UIKit moves the cards by writing their positions into Core
 * Animation presentation modifiers every frame from the main thread; the
 * values below are fitted to those writes. The web version runs the same
 * curves on the compositor, which keeps them moving while the main thread is
 * busy.
 *
 * Every leaf carries one or more `@source`; webkit and GUESS values also carry
 * the `@measure` task that will confirm or replace them. uikit.test.ts
 * enforces both.
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md
 */

export const navigation = {
  /**
   * The push and pop springs start moving at this many travels per second
   * (3527 pt/s on a 402 pt card), not from rest.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAPresentationModifier (value, velocity) fit, Oct 23 2026
   */
  pushVelocity: 8.773,
  /**
   * Where the card underneath ends, as a fraction of the container width:
   * it moves from 0 to −0.3 W while the incoming card moves from W to 0.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAPresentationModifier values, Oct 23 2026
   */
  parallax: -0.3,
  /**
   * The dimming over the card underneath: black at this alpha, its opacity
   * going 0 → 1 on the push spring.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, _UIParallaxDimmingView read, Oct 23 2026
   */
  dimmingAlpha: 0.1,
  /**
   * The transition context's duration, in ms; it paces completion callbacks
   * (a linear property animator), not the cards.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, transitionDuration read, Oct 23 2026
   */
  transitionMs: 350,
  /**
   * The interactive pop finishes when progress + this × velocity passes
   * `interactivePopFinishThreshold` (progress in widths, velocity in widths
   * per second): seconds of projection.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the pop decision method hooked over 61 controlled
   *   releases: the rule matches 58; the 3 misses all finished where it says
   *   cancel, Oct 23 2026
   */
  interactivePopFinishProjection: 0.35,
  /**
   * The progress the projected release must pass to finish the pop (a still
   * finger at 0.475 cancels).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the pop decision method over 61 releases, Oct 23 2026
   */
  interactivePopFinishThreshold: 0.5,
} as const;
