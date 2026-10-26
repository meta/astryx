// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file scroll.ts
 * @input Nothing; data only
 * @output Exports `scroll`, the UIScrollView constants: deceleration rates,
 *   the rubber-band coefficient, the bounce-back spring, paging and the
 *   content-touch delay
 * @position The scroll domain of the UIKit constants table (motion/uikit);
 *   read by the motion math and components
 *
 * Every leaf carries one `@source` (apple-docs | wwdc | webkit | measured |
 * GUESS); webkit and GUESS values also carry the `@measure` task that will
 * confirm or replace them (listed in MEASUREMENTS.md). uikit.test.ts
 * enforces both.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/MEASUREMENTS.md (measurement tasks)
 */

// The value of `scroll.delaysContentTouchesMs` (sourced there), its own
// export so the press clocks read it without the rest of the table
// (`architecture:component-style-authoring` INV6).
export const DELAYS_CONTENT_TOUCHES_MS = 150;

export const scroll = {
  decelerationRate: {
    /**
     * Normal deceleration: the release velocity is multiplied by this every
     * millisecond, as a continuous exponential (UIScrollView keeps ln r,
     * −0.002002, and velocities in pt/ms). The scroll view's own
     * target for a release (`scrollViewWillEndDragging`) is
     * v · r ÷ (1 − r), within 1 %: WWDC18 803's projection function.
     * @source apple-docs https://developer.apple.com/documentation/uikit/uiscrollview/decelerationrate-swift.struct/normal
     *   (the constant, not its number)
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, rawValue read, Oct 23 2026 (also a new scroll view's
     *   decelerationRate)
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, deceleration ivars read mid-coast
     *   (`_decelerationFactor` 0.998, `_decelerationLnFactorV` −0.002002, the
     *   velocity decaying 0.4343 over 400 ms) and willEndDragging targets,
     *   Oct 23 2026
     */
    normal: 0.998,
    /**
     * Fast deceleration (`UIScrollView.DecelerationRate.fast`).
     * @source apple-docs https://developer.apple.com/documentation/uikit/uiscrollview/decelerationrate-swift.struct/fast
     *   (the constant, not its number)
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, rawValue read and `_decelerationFactor` 0.99 (ln
     *   −0.01005) mid-coast, Oct 23 2026
     */
    fast: 0.99,
  },
  rubberBand: {
    /**
     * c in b = (1 − 1 ÷ (x·c ÷ d + 1))·d, d = the scroll view's size on the
     * axis, x = the finger's travel past the edge after the
     * pan's 10 pt hysteresis.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, UIScrollView offsets released 100 / 300 / 600 pt past
     *   the edge of an 874 pt view: 47 / 135 / 236.67 against the formula's
     *   46.85 / 134.9 / 236.6, Oct 23 2026
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, sheet drags hooked: UISheetPresentationController
     *   passes `withRubberBandCoefficient: 0.55` on every drag, Oct 23 2026
     */
    coefficient: 0.55,
  },
  /**
   * The spring that returns content released past an edge, and that catches
   * a coast hitting an edge (its velocity handed to the spring).
   * @source GUESS — critically damped as in I. Lobanov's UIScrollView
   *   reimplementation (no oscillation at the bound); pace from SwiftUI's
   *   `.smooth` default duration. Measured so far (iOS 26.2 simulator, Oct 23
   *   2026): back to the edge in about 0.5 s with no overshoot, but no single
   *   spring from rest fits releases 47, 135 and 237 pt past the edge, so
   *   UIKit's bounce is not a plain spring; the model is still to fit
   * @measure M-S3
   */
  bounce: {duration: 0.5, bounce: 0},
  paging: {
    /**
     * Deceleration rate a paging release is projected with to pick the next
     * page.
     * @source GUESS — UIScrollView paging behaves like a fast scroll view;
     *   the rate it uses internally is not documented
     * @measure M-PG1
     */
    projectionRate: 0.99,
    /**
     * The spring that carries a paging scroll view onto its page.
     * @source GUESS — SwiftUI `.smooth` default until measured
     * @measure M-PG1
     */
    snap: {duration: 0.5, bounce: 0},
  },
  /**
   * `delaysContentTouches`: how long a scroll view holds a touch-down from
   * its content while it decides whether the touch is a scroll (no highlight
   * flash on a quick scroll), in ms.
   * @source wwdc 2014-235 "Advanced Scrollviews and Touch Handling
   *   Techniques": the touch-delay recognizer UIScrollView uses runs "a
   *   pretty short timer … Let's say .15 seconds" (presenter's example value)
   * @source measured: Settings and Contacts, iOS 26.2, simulator driven with
   *   real HID touches at 60 fps, recorded with the touch press model
   *   (PRESS_ONSET_MS in packages/core/src/utils/pressGesture.ts, 2026-10-06)
   */
  delaysContentTouchesMs: DELAYS_CONTENT_TOUCHES_MS,
  /**
   * Scroll-to-top after a status-bar tap: not a spring. The offset
   * approaches the top as 1 − e^(−9.7 t) whatever the distance (done in about
   * 1.6 s for 500, 2000 or 8000 pt), which is a decay at this per-millisecond
   * rate (e^(−0.0097)) whose rest point is the top: a decay with a
   * starting velocity of 9.7 × the distance per second.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, setContentOffset log after status-bar taps (starts 85–95
   *   ms after the tap), Oct 23 2026
   */
  scrollToTopRate: 0.99035,
} as const;
