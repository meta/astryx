// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file springs.ts
 * @input Nothing; data only
 * @output Exports `springs`, every UIKit / SwiftUI interaction spring the
 *   touch presentations use, each in the vocabulary of its source
 *   (SpringDescription: duration/bounce, response/dampingRatio or
 *   mass/stiffness/damping; a reader normalizes them to one form)
 * @position The springs domain of the UIKit constants table (motion/uikit)
 *
 * Every leaf carries one or more `@source` (apple-docs | wwdc | webkit |
 * measured | GUESS); webkit and GUESS values also carry the `@measure` task
 * that will confirm or replace them (MEASUREMENTS.md lists them all).
 * uikit.test.ts enforces both.
 *
 * Most springs are measured on iOS 26.2 or documented by Apple; two are still
 * GUESSES (`segmentedThumb`, `banner`) and two come from WebKit
 * (`switchThumbMove`, `switchThumbStretch`). A guess starts from the
 * nearest sourced spring and names it, so a component built on the table
 * gets the right value the moment its measurement lands, without changing.
 *
 * Press highlight in/out are fades, not springs: see timing.ts.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/MEASUREMENTS.md (measurement tasks)
 */

/**
 * UIKit's default spring (see `springs.viewChange` for its sources), shared
 * by the system transitions measured to run on it.
 */
const UIKIT_DEFAULT_SPRING = {mass: 3, stiffness: 1000, damping: 500} as const;

/** Push and pop (see `springs.navigationPush`). */
const NAVIGATION_SPRING = {response: 0.3, dampingRatio: 1} as const;

/**
 * A sheet's fast release and swipe dismissal (see `springs.sheetReleaseFast`):
 * the presentation's pace at 80 % damping.
 */
const SHEET_RELEASE_FAST_SPRING = {
  response: 0.3441442326,
  dampingRatio: 0.8,
} as const;

/**
 * Alerts and action sheets, presenting and dismissing (see
 * `springs.alertPresent`): UIKit's legacy 0.404 s spring, critically damped.
 */
const ALERT_SPRING = {mass: 1, stiffness: 522.35, damping: 45.71} as const;

/** Menus and context menus opening (see `springs.menuOpen`). */
const MENU_OPEN_SPRING = {response: 0.32, dampingRatio: 0.8} as const;

/** Menus and context menus closing (see `springs.menuClose`). */
const MENU_CLOSE_SPRING = {response: 0.35, dampingRatio: 0.85} as const;

export const springs = {
  // ---------------------------------------------------------------------
  // Sourced presets
  // ---------------------------------------------------------------------

  /**
   * SwiftUI `.smooth`: no bounce. Also SwiftUI's `Spring()` and
   * `.spring(duration:bounce:)` defaults.
   * @source apple-docs https://developer.apple.com/documentation/swiftui/spring/smooth(duration:extrabounce:)
   */
  settle: {duration: 0.5, bounce: 0},
  /**
   * SwiftUI `.snappy`: "small amount of bounce", base bounce 0.15.
   * @source apple-docs https://developer.apple.com/documentation/swiftui/spring/snappy(duration:extrabounce:)
   */
  quickChange: {duration: 0.5, bounce: 0.15},
  /**
   * SwiftUI `.bouncy`: base bounce 0.3.
   * @source apple-docs https://developer.apple.com/documentation/swiftui/spring/bouncy(duration:extrabounce:)
   */
  emphasis: {duration: 0.5, bounce: 0.3},
  /**
   * SwiftUI `interactiveSpring()` defaults: for a value that tracks a finger.
   * @source apple-docs https://developer.apple.com/documentation/swiftui/animation/interactivespring(response:dampingfraction:blendduration:)
   */
  fingerTracking: {response: 0.15, dampingRatio: 0.86},
  /**
   * SwiftUI `Animation.default` since iOS 17 (what `withAnimation` uses).
   * @source apple-docs https://developer.apple.com/documentation/swiftui/animation/default
   */
  stateChange: {response: 0.55, dampingRatio: 1},
  /**
   * SwiftUI `.spring(response:dampingFraction:blendDuration:)` defaults.
   * @source apple-docs https://developer.apple.com/documentation/swiftui/animation/spring(response:dampingfraction:blendduration:)
   */
  directChange: {response: 0.5, dampingRatio: 0.825},
  /**
   * UIKit `UIView.animate(springDuration:bounce:…)` defaults (iOS 17).
   * @source apple-docs https://developer.apple.com/documentation/uikit/uiview/animate(springduration:bounce:initialspringvelocity:delay:options:animations:completion:)
   */
  timedChange: {duration: 0.5, bounce: 0},
  /**
   * UIKit's default spring, `UISpringTimingParameters()`: Apple documents
   * its damping ratio as 4.56, which is exactly 500 ÷ (2·√(3·1000)).
   * Overdamped on paper; Core Animation treats overdamping as critical
   * unless told otherwise, so in effect it is a critically
   * damped spring with ω₀ = 18.26 rad/s (response 0.344 s) that settles in
   * 0.506 s. The keyboard does not use it (see `keyboard`).
   * @source apple-docs https://developer.apple.com/documentation/uikit/uispringtimingparameters/init() (damping ratio 4.56)
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAAnimation read, Oct 23 2026: UISpringTimingParameters()
   *   is mass 3, stiffness 1000, damping 500; UIKit runs it for 0.505824 s
   *   (clamped to critical) whatever duration the animator was given, and
   *   `UIView.animate` with curve 7 outside the keyboard is this spring with
   *   its duration forced to 0.5 s
   */
  viewChange: UIKIT_DEFAULT_SPRING,

  // ---------------------------------------------------------------------
  // Navigation (UINavigationController)
  // ---------------------------------------------------------------------

  /**
   * Push (programmatic or a row tap): the incoming card slides in from the
   * trailing edge, the outgoing card shifts by `navigation.parallax`. The
   * spring does not start from rest: it starts at
   * `navigation.pushVelocity` × the travel per second.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, time-free fit of the (value, velocity) pairs UIKit
   *   writes to the cards' CAPresentationModifiers every frame (rms 5e-4 of
   *   the travel), Oct 23 2026
   */
  navigationPush: NAVIGATION_SPRING,
  /**
   * Pop (back button or programmatic): identical to the push.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAPresentationModifier fit as for the push, Oct 23 2026
   */
  navigationPop: NAVIGATION_SPRING,
  /**
   * Interactive pop finishing or cancelling after the finger lifts, starting
   * from the finger's velocity; which one is `navigation.interactivePop*`.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAPresentationModifier fit over released swipes,
   *   Oct 23 2026
   */
  navigationInteractivePopFinish: {response: 0.3, dampingRatio: 0.85},
  /**
   * Navigation bar elements (Liquid Glass) moving during a push or pop.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIView.animate(springDuration: 0.6, bounce: 0,
   *   .beginFromCurrentState) calls hooked during transitions, Oct 23 2026
   */
  navigationBarElements: {duration: 0.6, bounce: 0},

  // ---------------------------------------------------------------------
  // Sheets (UISheetPresentationController)
  // ---------------------------------------------------------------------

  /**
   * Sheet presented programmatically: UIKit's default spring
   * (`UIViewPropertyAnimator(duration: 0.4, timingParameters:
   * UISpringTimingParameters())`), which renders critically damped at
   * response 0.344 s; the same at the medium and large detents.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAAnimation dump (mass 3, stiffness 1000, damping 500,
   *   duration 0.5, allowsOverdamping off), Oct 23 2026
   */
  sheetPresent: UIKIT_DEFAULT_SPRING,
  /**
   * Sheet dismissed programmatically (Cancel / Done / a scrim tap).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAAnimation dump, the same spring as the presentation,
   *   Oct 23 2026
   */
  sheetDismiss: UIKIT_DEFAULT_SPRING,
  /**
   * Detent change (`animateChanges`) and the settle after a slow release
   * (below the sheet's fast-release speed, which the sheet's own table
   * records): critically damped at the same pace as the presentation.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `_UISpringParameters(dampingRatio: 1, response:
   *   0.3441442326)` hooked, CASpringAnimation mass 1, stiffness 333.333,
   *   damping 36.515, Oct 23 2026
   */
  sheetDetent: {response: 0.3441442326, dampingRatio: 1},
  /**
   * The settle after a fast release (from the sheet's fast-release speed
   * on), toward a detent or out of the screen: same pace, 80 % damping;
   * UIKit hands it the finger's velocity.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CASpringAnimation dump over 36 releases (mass 1,
   *   stiffness 333.333, damping 29.212), Oct 23 2026
   */
  sheetReleaseFast: SHEET_RELEASE_FAST_SPRING,
  /**
   * Sheet dismissed by a swipe: the fast-release spring.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CASpringAnimation dump (300 pt swipe in 0.15 s:
   *   stiffness 333.333, damping 29.212), Oct 23 2026
   */
  sheetDismissSwipe: SHEET_RELEASE_FAST_SPRING,

  // ---------------------------------------------------------------------
  // Alerts, action sheets, menus
  // ---------------------------------------------------------------------

  /**
   * Alert (UIAlertController .alert) appearing: fades in and scales from
   * 1.2 to 1, the dimming fading in alongside. UIKit asks
   * `UIView.animate(withDuration: 0.404, usingSpringWithDamping: 600,
   * initialSpringVelocity: 0)`; the damping clamps to critical, and the
   * spring settles at 0.404 s.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIView.animate hooked and CASpringAnimation dumped
   *   (mass 1, stiffness 522.350, damping 45.710, duration 0.404),
   *   Oct 23 2026
   */
  alertPresent: ALERT_SPRING,
  /**
   * Alert dismissing: the same spring, opacity only.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CASpringAnimation dump, Oct 23 2026
   */
  alertDismiss: ALERT_SPRING,
  /**
   * Action sheet (UIAlertController .actionSheet) appearing: identical to
   * the alert.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CASpringAnimation dump, Oct 23 2026
   */
  actionSheetPresent: ALERT_SPRING,
  /**
   * Action sheet dismissing: identical to the alert.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CASpringAnimation dump, Oct 23 2026
   */
  actionSheetDismiss: ALERT_SPRING,
  /**
   * UIMenu (from a button) opening; UIKit drives it per frame and lets it
   * track a finger still on the screen.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `_animateUsingSpringWithDampingRatio:response:tracking:`
   *   hooked (0.8, 0.32, tracking), Oct 23 2026
   */
  menuOpen: MENU_OPEN_SPRING,
  /**
   * UIMenu closing (a tap outside).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the same hook (0.85, 0.35, not tracking), Oct 23 2026
   */
  menuClose: MENU_CLOSE_SPRING,
  /**
   * Context menu (UIContextMenuInteraction): the preview lifting once the
   * long press commits.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the same hook (0.8, 0.32, tracking), Oct 23 2026
   */
  contextMenuLift: MENU_OPEN_SPRING,
  /**
   * Context menu dismissing (a tap outside).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the same hook (0.85, 0.35, not tracking), Oct 23 2026
   */
  contextMenuDismiss: MENU_CLOSE_SPRING,
  /**
   * What UIKit plays for a menu with Reduce Motion on: critically damped,
   * slower, no overshoot. A reference reading of UIKit only, never played:
   * under reduced motion no core transition springs (`design:reduced-motion`
   * DR1); a touch presentation cross-fades instead (DR2), and nothing opts
   * out (DR4, `spec:AST-094` FR8).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `_animateUsingSpringWithDampingRatio:response:tracking:`
   *   hooked with Reduce Motion on (1.0, 0.4), Oct 23 2026
   */
  menuReducedMotion: {response: 0.4, dampingRatio: 1},

  // ---------------------------------------------------------------------
  // Controls
  // ---------------------------------------------------------------------

  /**
   * UISwitch thumb travelling between off and on.
   * @source webkit Source/WebCore/rendering/cocoa/RenderThemeCocoa.mm
   *   `thumbMoveSpring = SpringSolver(1.0, 438.649…, 31.4159…)`, "Values
   *   chosen for consistency with UIKit" (= response 0.30 s, ratio 0.75);
   *   its settling duration is WebKit's iOS switch duration 0.48801 s
   *   (RenderThemeIOS.h). These are WebKit's iOS 18 values: UIKit's own
   *   switch frames differ, and a switch reads its measured table instead.
   * @measure M-SW02
   */
  switchThumbMove: {response: 0.3, dampingRatio: 0.75},
  /**
   * UISwitch thumb stretching while pressed and relaxing on release.
   * @source webkit Source/WebCore/rendering/cocoa/RenderThemeCocoa.mm
   *   `thumbPressSpring = SpringSolver(1.0, 322.272…, 31.2364…)`, "Values
   *   chosen for consistency with UIKit" (= response 0.35 s, ratio 0.87);
   *   settles in WebKit's held duration 0.50740 s (RenderThemeIOS.h). As
   *   for `switchThumbMove`, UIKit's own frames differ.
   * @measure M-SW03
   */
  switchThumbStretch: {response: 0.35, dampingRatio: 0.87},
  /**
   * UISegmentedControl selection thumb sliding to a new segment.
   * @source GUESS — WebKit's UIKit-matched switch thumb spring, the nearest
   *   sourced control thumb
   * @measure M-SG02
   * @measure M-SG03
   */
  segmentedThumb: {response: 0.3, dampingRatio: 0.75},

  // ---------------------------------------------------------------------
  // System
  // ---------------------------------------------------------------------

  /**
   * Keyboard frame animation, show and hide alike: critically damped,
   * response 0.2667 s. The notification reports curve 7 and 0.3833 s
   * (`timing.keyboardNotificationMs`); Core Animation cuts the spring there.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAAnimation read on the keyboard host and a
   *   keyboardLayoutGuide-pinned view, Oct 23 2026
   */
  keyboard: {mass: 1, stiffness: 555.0265, damping: 47.118},
  /**
   * Banner / toast sliding in from the top edge (system notification
   * banner as the reference).
   * @source GUESS — UIKit's default spring
   * @measure M-T1
   */
  banner: UIKIT_DEFAULT_SPRING,
} as const;
