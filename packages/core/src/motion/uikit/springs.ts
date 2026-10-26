// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file springs.ts
 * @input Nothing; data only
 * @output One export per UIKit / SwiftUI interaction spring the touch
 *   presentations use (`SHEET_PRESENT_SPRING`, `SETTLE_SPRING`, …), each in
 *   the vocabulary of its source (SpringDescription: duration/bounce,
 *   response/dampingRatio or mass/stiffness/damping; a reader normalizes them
 *   to one form), and `springs`, the table of all of them by row name
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

import {registerMotionTable} from '../roles';

// ---------------------------------------------------------------------
// Sourced presets
// ---------------------------------------------------------------------

/**
 * SwiftUI `.smooth`: no bounce. Also SwiftUI's `Spring()` and
 * `.spring(duration:bounce:)` defaults.
 * @source apple-docs https://developer.apple.com/documentation/swiftui/spring/smooth(duration:extrabounce:)
 */
export const SETTLE_SPRING = {duration: 0.5, bounce: 0} as const;

/**
 * SwiftUI `.snappy`: "small amount of bounce", base bounce 0.15.
 * @source apple-docs https://developer.apple.com/documentation/swiftui/spring/snappy(duration:extrabounce:)
 */
export const QUICK_CHANGE_SPRING = {duration: 0.5, bounce: 0.15} as const;

/**
 * SwiftUI `.bouncy`: base bounce 0.3.
 * @source apple-docs https://developer.apple.com/documentation/swiftui/spring/bouncy(duration:extrabounce:)
 */
export const EMPHASIS_SPRING = {duration: 0.5, bounce: 0.3} as const;

/**
 * SwiftUI `interactiveSpring()` defaults: for a value that tracks a finger.
 * @source apple-docs https://developer.apple.com/documentation/swiftui/animation/interactivespring(response:dampingfraction:blendduration:)
 */
export const FINGER_TRACKING_SPRING = {
  response: 0.15,
  dampingRatio: 0.86,
} as const;

/**
 * SwiftUI `Animation.default` since iOS 17 (what `withAnimation` uses).
 * @source apple-docs https://developer.apple.com/documentation/swiftui/animation/default
 */
export const STATE_CHANGE_SPRING = {response: 0.55, dampingRatio: 1} as const;

/**
 * SwiftUI `.spring(response:dampingFraction:blendDuration:)` defaults.
 * @source apple-docs https://developer.apple.com/documentation/swiftui/animation/spring(response:dampingfraction:blendduration:)
 */
export const DIRECT_CHANGE_SPRING = {
  response: 0.5,
  dampingRatio: 0.825,
} as const;

/**
 * UIKit `UIView.animate(springDuration:bounce:…)` defaults (iOS 17).
 * @source apple-docs https://developer.apple.com/documentation/uikit/uiview/animate(springduration:bounce:initialspringvelocity:delay:options:animations:completion:)
 */
export const TIMED_CHANGE_SPRING = {duration: 0.5, bounce: 0} as const;

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
export const VIEW_CHANGE_SPRING = {
  mass: 3,
  stiffness: 1000,
  damping: 500,
} as const;

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
export const NAVIGATION_PUSH_SPRING = {response: 0.3, dampingRatio: 1} as const;

/**
 * Pop (back button or programmatic): identical to the push.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, CAPresentationModifier fit as for the push, Oct 23 2026
 */
export const NAVIGATION_POP_SPRING = {response: 0.3, dampingRatio: 1} as const;

/**
 * Interactive pop finishing or cancelling after the finger lifts, starting
 * from the finger's velocity; which one is `navigation.interactivePop*`.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, CAPresentationModifier fit over released swipes,
 *   Oct 23 2026
 */
export const NAVIGATION_INTERACTIVE_POP_FINISH_SPRING = {
  response: 0.3,
  dampingRatio: 0.85,
} as const;

/**
 * Navigation bar elements (Liquid Glass) moving during a push or pop.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, UIView.animate(springDuration: 0.6, bounce: 0,
 *   .beginFromCurrentState) calls hooked during transitions, Oct 23 2026
 */
export const NAVIGATION_BAR_ELEMENTS_SPRING = {
  duration: 0.6,
  bounce: 0,
} as const;

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
export const SHEET_PRESENT_SPRING = {
  mass: 3,
  stiffness: 1000,
  damping: 500,
} as const;

/**
 * Sheet dismissed programmatically (Cancel / Done / a scrim tap).
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, CAAnimation dump, the same spring as the presentation,
 *   Oct 23 2026
 */
export const SHEET_DISMISS_SPRING = {
  mass: 3,
  stiffness: 1000,
  damping: 500,
} as const;

/**
 * Detent change (`animateChanges`) and the settle after a slow release
 * (below the sheet's fast-release speed, which the sheet's own table
 * records): critically damped at the same pace as the presentation.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, `_UISpringParameters(dampingRatio: 1, response:
 *   0.3441442326)` hooked, CASpringAnimation mass 1, stiffness 333.333,
 *   damping 36.515, Oct 23 2026
 */
export const SHEET_DETENT_SPRING = {
  response: 0.3441442326,
  dampingRatio: 1,
} as const;

/**
 * The settle after a fast release (from the sheet's fast-release speed
 * on), toward a detent or out of the screen: same pace, 80 % damping;
 * UIKit hands it the finger's velocity.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, CASpringAnimation dump over 36 releases (mass 1,
 *   stiffness 333.333, damping 29.212), Oct 23 2026
 */
export const SHEET_RELEASE_FAST_SPRING = {
  response: 0.3441442326,
  dampingRatio: 0.8,
} as const;

/**
 * Sheet dismissed by a swipe: the fast-release spring.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, CASpringAnimation dump (300 pt swipe in 0.15 s:
 *   stiffness 333.333, damping 29.212), Oct 23 2026
 */
export const SHEET_DISMISS_SWIPE_SPRING = {
  response: 0.3441442326,
  dampingRatio: 0.8,
} as const;

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
export const ALERT_PRESENT_SPRING = {
  mass: 1,
  stiffness: 522.35,
  damping: 45.71,
} as const;

/**
 * Alert dismissing: the same spring, opacity only.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, CASpringAnimation dump, Oct 23 2026
 */
export const ALERT_DISMISS_SPRING = {
  mass: 1,
  stiffness: 522.35,
  damping: 45.71,
} as const;

/**
 * Action sheet (UIAlertController .actionSheet) appearing: identical to
 * the alert.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, CASpringAnimation dump, Oct 23 2026
 */
export const ACTION_SHEET_PRESENT_SPRING = {
  mass: 1,
  stiffness: 522.35,
  damping: 45.71,
} as const;

/**
 * Action sheet dismissing: identical to the alert.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, CASpringAnimation dump, Oct 23 2026
 */
export const ACTION_SHEET_DISMISS_SPRING = {
  mass: 1,
  stiffness: 522.35,
  damping: 45.71,
} as const;

/**
 * UIMenu (from a button) opening; UIKit drives it per frame and lets it
 * track a finger still on the screen.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, `_animateUsingSpringWithDampingRatio:response:tracking:`
 *   hooked (0.8, 0.32, tracking), Oct 23 2026
 */
export const MENU_OPEN_SPRING = {response: 0.32, dampingRatio: 0.8} as const;

/**
 * UIMenu closing (a tap outside).
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, the same hook (0.85, 0.35, not tracking), Oct 23 2026
 */
export const MENU_CLOSE_SPRING = {response: 0.35, dampingRatio: 0.85} as const;

/**
 * A sub-menu opening in place (its row tapped on a phone): a card laid over
 * the parent's rows from the tapped row grows down to fit the sub-menu, the
 * menu's box with it, and the parent's rows recede, on this spring
 * (spec:AST-094 FR34).
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, a pull-down button at y 150 whose menu opens downward
 *   (Alpha, Beta, Sort By ▸ (Name, Date, Size), Delete), every menu label,
 *   image and view read per 60 Hz tick, Oct 24 2026 (t from the tap-down;
 *   the lift at 60 ms): the menu's box kept its top and grew 188 → 190.9
 *   (106 ms), 198.1 (123), 218.1 (156), 238.5 (189), 255.6 (223), 268.2
 *   (256), 276.7 (289), 282.1 (324), 285.2 (359), 286.8 (389), 287.6 (424),
 *   settling at 287.2; the parent rows' opacity followed it (1 → 0.5 by 389
 *   ms). UIKit's own spring for it, logged as the
 *   `UIViewSpringAnimationBehavior` it starts a few ms after the lift on
 *   every sub-menu row (four captures): damping ratio 0.85, response 0.4 s.
 *   It fits the box's eleven frames to 0.12 pt rms of the 99 pt travel
 *   (start 89.5 ms), as a free single-spring fit does (0.86, 0.395)
 */
export const SUB_MENU_OPEN_SPRING = {
  response: 0.4,
  dampingRatio: 0.85,
} as const;

/**
 * Back out of a sub-menu (its header tapped): the card shrinks back up into
 * the row, the menu's box with it, and the parent's rows come back, on this
 * spring (spec:AST-094 FR34).
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, the same menu and readings, Oct 24 2026 (t from the
 *   tap-down; the lift at 60 ms): the box 287.2 → 284.3 (128 ms), 268.7
 *   (160), 249.9 (195), 233 (228), 219.6 (260), 209.6 (296), 202.5 (329),
 *   197.6 (361), 194.3 (395), 192.1 (428), 189.7 (494), 188 (628); the
 *   parent rows' opacity 0.5 → 0.59 (160), 0.69 (195), 0.77 (228), 0.84
 *   (260), 0.89 (296), 0.93 (329), 0.95 (361), 0.97 (395), 0.99 (461), 1
 *   (527). UIKit's own spring for it, logged as the
 *   `UIViewSpringAnimationBehavior` it starts on every header back (three
 *   captures): damping ratio 1, response 0.4 s. It fits the box's twelve
 *   frames to 0.28 pt rms of the 99 pt travel (start 111 ms), the opacity to
 *   0.0055 rms
 */
export const SUB_MENU_BACK_SPRING = {response: 0.4, dampingRatio: 1} as const;

/**
 * Context menu (UIContextMenuInteraction): the preview lifting once the
 * long press commits.
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, the same hook (0.8, 0.32, tracking), Oct 23 2026
 */
export const CONTEXT_MENU_LIFT_SPRING = {
  response: 0.32,
  dampingRatio: 0.8,
} as const;

/**
 * Context menu dismissing (a tap outside).
 * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
 *   iPhone 17 Pro, the same hook (0.85, 0.35, not tracking), Oct 23 2026
 */
export const CONTEXT_MENU_DISMISS_SPRING = {
  response: 0.35,
  dampingRatio: 0.85,
} as const;

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
export const MENU_REDUCED_MOTION_SPRING = {
  response: 0.4,
  dampingRatio: 1,
} as const;

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
export const SWITCH_THUMB_MOVE_SPRING = {
  response: 0.3,
  dampingRatio: 0.75,
} as const;

/**
 * UISwitch thumb stretching while pressed and relaxing on release.
 * @source webkit Source/WebCore/rendering/cocoa/RenderThemeCocoa.mm
 *   `thumbPressSpring = SpringSolver(1.0, 322.272…, 31.2364…)`, "Values
 *   chosen for consistency with UIKit" (= response 0.35 s, ratio 0.87);
 *   settles in WebKit's held duration 0.50740 s (RenderThemeIOS.h). As
 *   for `switchThumbMove`, UIKit's own frames differ.
 * @measure M-SW03
 */
export const SWITCH_THUMB_STRETCH_SPRING = {
  response: 0.35,
  dampingRatio: 0.87,
} as const;

/**
 * UISegmentedControl selection thumb sliding to a new segment.
 * @source GUESS — WebKit's UIKit-matched switch thumb spring, the nearest
 *   sourced control thumb
 * @measure M-SG02
 * @measure M-SG03
 */
export const SEGMENTED_THUMB_SPRING = {
  response: 0.3,
  dampingRatio: 0.75,
} as const;

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
export const KEYBOARD_SPRING = {
  mass: 1,
  stiffness: 555.0265,
  damping: 47.118,
} as const;

/**
 * Banner / toast sliding in from the top edge (system notification
 * banner as the reference).
 * @source GUESS — UIKit's default spring
 * @measure M-T1
 */
export const BANNER_SPRING = {mass: 3, stiffness: 1000, damping: 500} as const;

/**
 * Every spring above, by row name: the table the existing readers use. A
 * component imports only the rows it plays (`architecture:component-style-authoring`
 * INV6), each the same object as its row here.
 */
export const springs = {
  settle: SETTLE_SPRING,
  quickChange: QUICK_CHANGE_SPRING,
  emphasis: EMPHASIS_SPRING,
  fingerTracking: FINGER_TRACKING_SPRING,
  stateChange: STATE_CHANGE_SPRING,
  directChange: DIRECT_CHANGE_SPRING,
  timedChange: TIMED_CHANGE_SPRING,
  viewChange: VIEW_CHANGE_SPRING,
  navigationPush: NAVIGATION_PUSH_SPRING,
  navigationPop: NAVIGATION_POP_SPRING,
  navigationInteractivePopFinish: NAVIGATION_INTERACTIVE_POP_FINISH_SPRING,
  navigationBarElements: NAVIGATION_BAR_ELEMENTS_SPRING,
  sheetPresent: SHEET_PRESENT_SPRING,
  sheetDismiss: SHEET_DISMISS_SPRING,
  sheetDetent: SHEET_DETENT_SPRING,
  sheetReleaseFast: SHEET_RELEASE_FAST_SPRING,
  sheetDismissSwipe: SHEET_DISMISS_SWIPE_SPRING,
  alertPresent: ALERT_PRESENT_SPRING,
  alertDismiss: ALERT_DISMISS_SPRING,
  actionSheetPresent: ACTION_SHEET_PRESENT_SPRING,
  actionSheetDismiss: ACTION_SHEET_DISMISS_SPRING,
  menuOpen: MENU_OPEN_SPRING,
  menuClose: MENU_CLOSE_SPRING,
  subMenuOpen: SUB_MENU_OPEN_SPRING,
  subMenuBack: SUB_MENU_BACK_SPRING,
  contextMenuLift: CONTEXT_MENU_LIFT_SPRING,
  contextMenuDismiss: CONTEXT_MENU_DISMISS_SPRING,
  menuReducedMotion: MENU_REDUCED_MOTION_SPRING,
  switchThumbMove: SWITCH_THUMB_MOVE_SPRING,
  switchThumbStretch: SWITCH_THUMB_STRETCH_SPRING,
  segmentedThumb: SEGMENTED_THUMB_SPRING,
  keyboard: KEYBOARD_SPRING,
  banner: BANNER_SPRING,
} as const;

/**
 * The springs spec:AST-094 FR4 names: the only ones that are motion roles.
 * The registry takes these rows alone, so registering ships no other spring.
 */
const SPRING_ROLES = {
  fingerTracking: FINGER_TRACKING_SPRING,
  emphasis: EMPHASIS_SPRING,
  settle: SETTLE_SPRING,
  quickChange: QUICK_CHANGE_SPRING,
  viewChange: VIEW_CHANGE_SPRING,
  timedChange: TIMED_CHANGE_SPRING,
  stateChange: STATE_CHANGE_SPRING,
  directChange: DIRECT_CHANGE_SPRING,
  menuOpen: MENU_OPEN_SPRING,
  menuClose: MENU_CLOSE_SPRING,
  subMenuOpen: SUB_MENU_OPEN_SPRING,
  subMenuBack: SUB_MENU_BACK_SPRING,
};

/**
 * Registers the springs spec:AST-094 FR4 names as internal motion roles
 * (motion/roles.ts), by their row names (`springs.settle`). Every other
 * spring, UIKit's menu spring under Reduce Motion and the keyboard's
 * included, is not a role. Nothing registers on import: the touch code that
 * plays a role calls it once (it is idempotent), so a page that never does
 * ships no registry.
 */
export function registerSpringsTable(): void {
  registerMotionTable('springs', SPRING_ROLES, {
    roles: Object.keys(SPRING_ROLES),
  });
}
