// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file navigationMotion.ts
 * @input Core's UIKit navigation table and its four navigation springs, from
 *   Core's internal touch entry
 * @output `navigation` and `springs`: Core's navigation values with the ones
 *   only NavigationStack reads, each with its measurement. `bars`: iOS 26's
 *   scroll edge effect under the bar.
 * @position NavigationStack's motion table. Core's tables keep the values
 *   Core's own components read.
 */

import {
  NAVIGATION_BAR_ELEMENTS_SPRING,
  NAVIGATION_INTERACTIVE_POP_FINISH_SPRING,
  NAVIGATION_POP_SPRING,
  NAVIGATION_PUSH_SPRING,
  navigation as coreNavigation,
} from '@astryxdesign/core/internal/touch';

export const navigation = {
  ...coreNavigation,
  /**
   * Past its start (a finger brought back beyond where the screen is fully
   * in place), the interactive pop's top screen resists with UIKit's rubber
   * band. The band is (1 − 1 ÷ (x·c ÷ d + 1))·d, with this coefficient c and
   * d the stack's width. The screen follows at c of the finger at its start.
   * A release there returns on `springs.navigationInteractivePopReturn`. Over
   * the measured 10.7 pt the band is within 0.2 pt of a straight line.
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro, a back
   *   swipe scrubbed to ~50 % and brought back past its start at ~310 pt/s,
   *   lifted 10.7 pt of finger after the view crossed its start: fitted
   *   jointly with `springs.navigationInteractivePopReturn` to the view's x
   *   at the lift (−6.89 pt) and after it, Oct 24 2026
   */
  interactivePopRubberBand: 0.71,
  /**
   * Travel, in px, before the full-width content swipe (iOS 26's back swipe
   * from anywhere in the content) begins.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UINavigationController.contentSwipe began after 27–30 pt
   *   of travel for drags at or under 600 pt/s, Oct 23 2026
   * At 1000 pt/s it began on the first move event (~8 pt), so above some
   * speed between 600 and 1000 pt/s it begins sooner.
   */
  contentPopHysteresis: 27,
  /**
   * On a push from the root, the back button's glass platter is there from
   * the first frame. Its chevron starts fading in (on
   * `springs.navigationBackButton`) this many ms after the screens start
   * moving. On a pop to the root the chevron fades out at once on the same
   * spring and the platter leaves with the screen.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, inline root ↔ inline detail, per 60 Hz frame: the
   *   slide's start fitted with the push spring (rms 0.0015 of the travel);
   *   the chevron image's effective opacity (0.027, 0.27, 0.53, 0.72, 0.84,
   *   0.91, 0.97 …) fits the 0.4 s spring from 60.8 ms after it within
   *   0.010; on the pop it starts within a frame of the slide (0.973, 0.825,
   *   0.642, 0.474 … at 34 ms steps), Oct 24 2026
   */
  backChevronPushDelayMs: 60,
  /**
   * How far, in px, the bar's title moves on `springs.navigationBarElements`.
   * It rises as it fades in once a large title has scrolled under the bar.
   * It sinks as it fades out when the large title comes back.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, real HID drags of a large-title table: the inline title
   *   label's frame y 88.67 → 73.67 on a UIView spring (springDuration 0.6,
   *   bounce 0) fired ~5 pt after the bar collapsed, Oct 24 2026
   */
  inlineTitleRise: 15,
} as const;

export const springs = {
  navigationPush: NAVIGATION_PUSH_SPRING,
  navigationPop: NAVIGATION_POP_SPRING,
  navigationInteractivePopFinish: NAVIGATION_INTERACTIVE_POP_FINISH_SPRING,
  navigationBarElements: NAVIGATION_BAR_ELEMENTS_SPRING,
  /**
   * Interactive pop released past its start (the screen rubber-banded by
   * `navigation.interactivePopRubberBand`): it returns to rest from the
   * finger's velocity, overshooting further first.
   * @source measured: UIKit lab, iOS 26.2 simulator, iPhone 17 Pro, the
   *   cancelled scrub's per-frame view x (−6.89 pt at the lift at
   *   −310 pt/s, −14.21 pt 50 ms later, |x| < 0.5 pt from ~0.23 s, no
   *   overshoot past rest). Damped spring
   *   x(t) = e^(−ζωt)(x0 cos ω_d t + (v0 + ζωx0)/ω_d sin ω_d t), v0 the
   *   finger's velocity, x0 from `navigation.interactivePopRubberBand`,
   *   fitted jointly: ω = 16.5 rad/s, ζ = 0.81, with the at-lift value
   *   within 0.8 pt, the peak within 0.6 pt (−13.7 pt at 47 ms), at most
   *   0.2 pt past rest and |x| < 0.5 pt by 0.27 s; worst frame 1.8 pt,
   *   mid-return, Oct 24 2026
   */
  navigationInteractivePopReturn: {response: 0.381, dampingRatio: 0.81},
  /**
   * The back button's chevron fading in on a push and out on a pop. An
   * interactive swipe leaves it at full opacity; it fades once the pop
   * finishes.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the chevron's effective opacity per frame; a
   *   critically damped spring of response 0.4 s from rest fits all twelve
   *   33 ms samples within 0.021, Oct 23 2026
   */
  navigationBackButton: {response: 0.4, dampingRatio: 1},
} as const;

/**
 * iOS 26.2's bars paint no background. The scroll view's edge effect
 * separates a bar from the content under it: a veil of one colour, with
 * nothing blurred. Its colour is a theme value; this table holds its shape
 * and its timing. Lengths are in pt (CSS px).
 */
export const bars = {
  scrollEdgeEffect: {
    /**
     * The veil is off while the content sits at most this far past its rest
     * offset, and on beyond it. It is a switch, not a ramp, with no
     * hysteresis. Overscroll keeps it off.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, content offset stepped from +7.5 to +12.5 pt past
     *   rest in 0.25 pt steps, ScrollEdgeEffectView model and presentation
     *   opacity read after each step and 500 ms later, Oct 23 2026
     */
    switchPt: 10,
    /**
     * The veil fading in as the content passes the switch: critically
     * damped, response 0.2 s.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, `-[CALayer addAnimation:forKey:]` hooked on the effect
     *   view while crossing the switch (opacity, mass 1, stiffness 986.96,
     *   damping 62.83, duration 0.294), and its presentation opacity sampled
     *   every frame through a 100 pt/s HID drag, Oct 23 2026
     */
    appear: {mass: 1, stiffness: 986.96, damping: 62.83},
    /**
     * The veil fading out as the content comes back over the switch:
     * critically damped, response 0.35 s.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, `-[CALayer addAnimation:forKey:]` hooked on the effect
     *   view while crossing the switch back (opacity, mass 1, stiffness
     *   322.27, damping 35.90, duration 0.514), and its presentation opacity
     *   sampled every frame through the drag back to rest, Oct 23 2026
     */
    disappear: {mass: 1, stiffness: 322.27, damping: 35.9},
    /**
     * How far the soft edge reaches below the bar's bottom edge.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, ScrollEdgeEffectView frame (0, 0, 402, 170.8) under a
     *   standard navigation bar at y 62, height 54, Oct 23 2026
     */
    softExtentPt: 54.8,
    veil: {
      /**
       * UIKit's highest veil alpha, in light and dark mode alike. iOS adapts
       * the veil to the content's luminance. The web veil takes the bar's
       * theme colour and plays 0.95, so a bar's title keeps 4.5:1 over
       * bright content.
       * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
       *   iPhone 17 Pro, screenshots of solid black, #808080 and white
       *   content under the effect read per pt row (y 0–180, light and dark,
       *   with and without a title), and the LuminanceAdjustment layer's
       *   opacity (0.85 in both modes), Oct 23 2026
       */
      maxAlpha: 0.85,
      /**
       * Under a titled bar, the veil's edge is half-transparent this far
       * above the bottom of the bar's content. An expanded large title sits
       * outside the veil.
       * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
       *   iPhone 17 Pro, PocketMask's ShadowLayer frame in window coordinates
       *   with an inline title and with a collapsed large title (bottom edge
       *   at y 106), with no bar content and with an expanded large title
       *   (y 51), Oct 23 2026
       */
      edgeAboveContentBottomPt: 10,
      /**
       * How soft the edge is under a titled bar. The veil's alpha is
       * `maxAlpha × (1 − Φ((y − edge) / softnessPt))`, with Φ the standard
       * normal CDF. Nothing behind the veil is blurred.
       * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
       *   iPhone 17 Pro, the ShadowLayer's shadowRadius (18 with a title, 24
       *   without), per-pt-row profiles, 1 pt stripe contrast per row,
       *   Oct 23 2026
       */
      softnessPt: 18,
    },
  },
} as const;
