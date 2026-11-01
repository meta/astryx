// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file swipeActions.ts
 * @input Nothing; data only
 * @output Exports `swipeActions`: the swipe-action row's gesture thresholds
 *   (the web's claim and UIKit's swipe), its tracking and settle springs, and
 *   the speed and position that pick where a release lands
 * @position The swipe-actions domain of the UIKit constants table
 *   (motion/uikit): `UIContextualAction` / `UISwipeActionsConfiguration` rows
 *   of a table or collection list
 *
 * Measured on a UIKit host app (plain `UITableView`, 402 pt rows, two
 * trailing actions, iOS 26.2). Lengths are in pt (CSS px), springs in the
 * vocabulary UIKit was read in (`toSpring` normalizes).
 *
 * Every leaf carries one or more `@source`; GUESS values also carry the
 * `@measure` task that will confirm or replace them. uikit.test.ts enforces
 * both.
 *
 * Reduce Motion is not a value here. UIKit keeps both springs under it (lab,
 * iOS 26.2 simulator, iPhone 17 Pro, Reduce Motion on: the same
 * `UISpringTimingParameters(mass: 2, stiffness: 200, damping: 100)` animators
 * on tracking and release, and the full swipe still performs, Oct 23 2026),
 * but `design:reduced-motion` governs Astryx: what a release starts
 * cross-fades (DR2), and a core component keeps no motion under it (DR4).
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md
 */

export const swipeActions = {
  /**
   * Sideways travel at which the row claims the touch from the browser, NOT
   * a UIKit value: on the web a scrolling ancestor takes the touch at about
   * 10 px unless the page cancels `touchmove` before that, so the row claims
   * at 8 px and its swipe still begins at `hysteresis`. In between the touch
   * moves neither the row nor the page.
   * @source measured: Mobile Safari, iOS 26.2 simulator, iPhone 17 Pro, the
   *   touch stream against WebKit's scroll commit on a scrollable element
   *   (the last cancelable `touchmove` at 10 px; cancelling every `touchmove`
   *   from 8 px keeps the page still for the whole gesture), Oct 23 2026
   */
  claim: 8,
  /**
   * Finger travel before the swipe begins. The travel up to that point is
   * not part of the swipe: the row starts from where it was, it never jumps
   * by the threshold.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `_UISwipeActionPanGestureRecognizer` `_hysteresis` ivar
   *   read (25) and a 1 pt step drag: began at exactly 25 pt of travel with
   *   a translation of 0, Oct 23 2026
   */
  hysteresis: 25,
  /**
   * The spring the row follows the finger with. Each move starts a new
   * spring toward the finger's offset, from the row's presentation value and
   * velocity, so the row trails a moving finger and catches up when it
   * stops. Overdamped on paper; Core Animation renders it critically damped
   * (allowsOverdamping off), ω₀ = 10 rad/s, which `toSpring` mirrors.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `UIViewPropertyAnimator` with
   *   `UISpringTimingParameters(mass: 2, stiffness: 200, damping: 100)`
   *   read on every tracking update, seeded with the presentation velocity,
   *   settlingDuration 0.9235 s, Oct 23 2026
   */
  tracking: {mass: 2, stiffness: 200, damping: 100},
  /**
   * The settle after the finger lifts, to open, to closed or out: the same
   * spring, seeded with the row's presentation velocity (the tracking
   * spring's), not with the finger's.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the release animator read: mass 2, stiffness 200,
   *   damping 100, rendered critically damped; a 1000 pt/s closing flick
   *   seeded it with the presentation velocity (initialVelocity 2.88), not
   *   the finger's, Oct 23 2026
   */
  settle: {mass: 2, stiffness: 200, damping: 100},
  /**
   * Where a slow release lands (one slower than `releaseVelocity`): past
   * this fraction of the open width the row opens, short of it the row
   * closes.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, releases at rest: 0.32 × the 156.67 pt open width
   *   closed and 0.56 opened (batch 10a), Oct 23 2026
   * @source GUESS — the fraction inside the measured 0.32 to 0.56 bracket
   * @measure M-SA01
   */
  openFraction: 0.5,
  /**
   * A release this fast goes the way it moves: it opens the row when it
   * opens and closes it when it closes, from anywhere short of the commit
   * point. A flick therefore never fires an action. The speed is the release
   * velocity of a dragged surface (`spec:AST-100` FR2): the pan's velocity as
   * the finger lifts, and 0 once the finger has stayed still before lifting,
   * where UIKit's pan, which never decays, still reports its last moving
   * speed. The measurements below are UIKit's pan velocities.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, the swipe pan's velocity read at its end: released past
   *   half the open width while closing at 19.9, 21.2, 35.7 and 40.7 pt/s
   *   the row opened, and at 56.1, 56.5, 68.5, 105, 200 and 308 pt/s it
   *   closed (batch 38d); of 51 releases every one at 283 pt/s or more went
   *   its way (batch 10a), Oct 23 2026
   * @source GUESS — the speed inside the measured 40.7 to 56.1 pt/s bracket
   * @measure M-SA05
   */
  releaseVelocity: 48,
  /**
   * Where the full swipe confirms: this far short of the row's far edge the
   * row's offset snaps to on confirming (UIKit's `confirmationThreshold`,
   * the table width less this inset, whatever the action count).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `UISwipeActionPullView.confirmationThreshold` read:
   *   −373 at 402 pt and −346 at 375 pt, with one, two and three actions
   *   (batch 10b); on confirming the row jumped from −326 to −376.6 ahead of
   *   the finger (batch 38), Oct 23 2026
   */
  confirmInset: 29,
  /**
   * How far from the open width toward the confirmation offset (the row
   * width less `confirmInset`) the finger must have dragged for the full
   * swipe to confirm. Judged on the finger's travel, not the row's: the row
   * lags the finger on its spring.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, 402 pt rows: with a 204.67 pt open width a release
   *   performed from 335 pt of swipe and not from 315, at every velocity
   *   tried, and backing out from 345 to 315 left the row unconfirmed
   *   (batch 38); with a 156.67 pt open width it performed from 315 and not
   *   from 275 (batch 10b): 0.655 to 0.732 of the way, Oct 23 2026
   * @source GUESS — the fraction inside the measured 0.655 to 0.732 bracket
   * @measure M-SA02
   */
  confirmFraction: 0.69,
  /**
   * How far past the row's edge the row travels when an action fires and
   * the row goes out.
   * @source GUESS — the distance Astryx used before the UIKit lab
   * @measure M-SA04
   */
  slideOutOvershoot: 24,
} as const;
