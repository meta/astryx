// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file timing.ts
 * @input Nothing; data only
 * @output Exports `timing`: the non-spring clocks and curves UIKit uses
 *   (press highlight onset, flash and fade, Core Animation's named Bézier
 *   curves, the navigation bar hide/show duration, the keyboard
 *   notification duration, the Reduced Motion cross-fade)
 * @position The timing domain of the UIKit constants table (motion/uikit)
 *
 * Every leaf carries one or more `@source` (apple-docs | wwdc | webkit |
 * measured | GUESS); webkit and GUESS values also carry the `@measure` task
 * that will confirm or replace them (MEASUREMENTS.md). uikit.test.ts
 * enforces both.
 *
 * Durations are in ms (the unit of pointer-event timestamps, which these
 * clocks are compared against); curves are cubic-bézier control points
 * [x1, y1, x2, y2].
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/MEASUREMENTS.md (measurement tasks)
 * - /packages/core/src/utils/pressGesture.ts (the press clocks are measured
 *   there and must agree; uikit/uikit.test.ts checks it)
 */

/**
 * The touch press clocks, its own export so a reader of one clock does not
 * bundle the rest of the table (`architecture:component-style-authoring`
 * INV6).
 */
export const press = {
  /**
   * Highlight onset once a press is believed: none, the highlight is
   * painted in the frame the touch is accepted (after
   * `scroll.delaysContentTouchesMs` inside a scroller).
   * @source measured: Settings and Contacts, iOS 26.2, simulator driven
   *   with real HID touches at 60 fps (touch press model,
   *   packages/core/src/utils/pressGesture.ts, 2026-10-06)
   */
  highlightInMs: 0,
  /**
   * A tap released before the onset delay still flashes the highlight at
   * full strength for this long before fading.
   * @source measured: Settings and Contacts, iOS 26.2, simulator driven
   *   with real HID touches at 60 fps (PRESS_FLASH_MS,
   *   packages/core/src/utils/pressGesture.ts, 2026-10-06)
   */
  flashMs: 100,
  /**
   * Highlight fade after release: UIKit's deselect cross-fade.
   * @source measured: Settings and Contacts, iOS 26.2, simulator driven
   *   with real HID touches at 60 fps (PRESS_FADE_MS / pressConsts.releaseMs,
   *   packages/core/src/utils/pressGesture.ts, 2026-10-06)
   */
  highlightOutMs: 200,
  /**
   * The highlight fade's curve after release: an ease-out that spends the
   * whole clock fading (strength about 0.2 at the midpoint).
   * @source GUESS — the release curve the touch press model ships with
   *   (`RELEASE_EASE`, packages/core/src/utils/interactionOverlay.stylex.ts),
   *   chosen to read as UIKit's deselect cross-fade, not read from UIKit
   * @measure M-PR1
   */
  highlightOutCurve: [0, 0, 0.2, 1],
  /**
   * A touch on a scroller that moved this recently brakes it instead of
   * pressing.
   * @source measured: Settings and Contacts, iOS 26.2, simulator driven
   *   with real HID touches at 60 fps (PRESS_SCROLL_BRAKE_MS,
   *   packages/core/src/utils/pressGesture.ts, 2026-10-06)
   */
  scrollBrakeMs: 150,
  /**
   * UIButton (filled configuration) release: the label cross-fade and the
   * background color both run 0.25 s on `curves.move`.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAAnimation read (CATransition fade and backgroundColor),
   *   Oct 23 2026
   */
  buttonReleaseMs: 250,
} as const;

export const timing = {
  press,
  curves: {
    /**
     * `CAMediaTimingFunctionName.default`: "the timing of … most system
     * animations" that are not springs.
     * @source apple-docs https://developer.apple.com/documentation/quartzcore/camediatimingfunctionname/default
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAMediaTimingFunction read from UIView.animate,
     *   Oct 23 2026
     */
    viewChange: [0.25, 0.1, 0.25, 1],
    /**
     * `easeInEaseOut`; UIKit's default curve (`UIView.AnimationCurve
     * .easeInOut`, "the default curve for most animations").
     * @source apple-docs https://developer.apple.com/documentation/quartzcore/camediatimingfunctionname/easeineaseout
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAMediaTimingFunction read from UIView.animate,
     *   Oct 23 2026
     */
    move: [0.42, 0, 0.58, 1],
    /**
     * `easeIn`.
     * @source apple-docs https://developer.apple.com/documentation/quartzcore/camediatimingfunctionname/easein
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAMediaTimingFunction read from UIView.animate,
     *   Oct 23 2026
     */
    exit: [0.42, 0, 1, 1],
    /**
     * `easeOut`.
     * @source apple-docs https://developer.apple.com/documentation/quartzcore/camediatimingfunctionname/easeout
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAMediaTimingFunction read from UIView.animate,
     *   Oct 23 2026
     */
    entrance: [0, 0, 0.58, 1],
  },
  /**
   * `UINavigationController.hideShowBarDuration`, in ms.
   * @source apple-docs https://developer.apple.com/documentation/uikit/uinavigationcontroller/hideshowbarduration
   *   (the constant, not its value)
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, read, Oct 23 2026
   */
  navigationBarHideShowMs: 200,
  /**
   * The duration the keyboard notifications report
   * (UIKeyboardAnimationDurationUserInfoKey, with curve 7), show and hide
   * alike, in ms. The frame follows `springs.keyboard`, cut at this time.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIKeyboardWillShow / WillHide / WillChangeFrame read,
   *   Oct 23 2026
   */
  keyboardNotificationMs: 383.3,
  /**
   * Core Animation's implicit animation duration
   * (`CATransaction.animationDuration()`), in ms.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, read, Oct 23 2026
   */
  stateChangeMs: 250,
  /**
   * Reduce Motion with Prefer Cross-Fade Transitions: a navigation push or pop
   * becomes a cross-fade of this length on `curves.move` (the new view
   * fades in while the old one fades out, with no travel), in ms. Sheets,
   * full-screen modals and alerts fade on their own presentation spring
   * instead. A reference reading only: under reduced motion a touch
   * presentation follows `design:reduced-motion` DR2 and DR4, not this clock
   * (`spec:AST-094` FR8).
   * @source apple-docs https://developer.apple.com/documentation/uikit/uiaccessibility/preferscrossfadetransitions
   *   (the setting)
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAAnimation dump with Reduce Motion and Prefer
   *   Cross-Fade Transitions on (opacity CABasicAnimation 0.5 s,
   *   (0.42, 0, 0.58, 1)), Oct 23 2026
   */
  reducedMotionCrossFadeMs: 500,
} as const;
