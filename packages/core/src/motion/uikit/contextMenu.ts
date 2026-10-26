// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenu.ts
 * @input The motion registry (registerContextMenuTable only)
 * @output Exports `contextMenu`: UIContextMenuInteraction's touch timeline
 *   (when the press feedback starts, when the long press commits, when the
 *   menu displays), how far the finger may drift, the press feedback's growth,
 *   spring and display latency, and the commit haptic's stand-in where only a
 *   vibration motor exists; and `registerContextMenuTable`, which registers
 *   its visual values with the motion registry (none is a motion role)
 * @position The context-menu domain of the UIKit constants table
 *   (motion/uikit), imported by ContextMenu's own modules and not re-exported
 *   from the table's barrel, so only a page that animates a context menu
 *   loads it; its lift and dismissal springs are `springs.contextMenuLift`
 *   and `springs.contextMenuDismiss`
 *
 * A context menu is not a plain long press. On iOS 26.2 a finger resting on
 * the view starts a press feedback after 150 ms: a copy of the view grows
 * uniformly, its size following a linear ramp through a spring. At 400 ms the
 * press commits: the click haptic plays and the touch can no longer become a
 * tap. The menu displays at 735 ms if the finger is still down, or as soon as
 * it lifts after the commit. A finger that lifts before the commit, or drifts
 * too far before the menu displays, gets no menu, and the copy springs back.
 *
 * UIKit runs this on display-link ticks, so a 60 Hz screen shows each moment
 * on the first frame after it (the feedback at 151 ms, the commit at 417 ms).
 * Times here are the moments themselves, counted from the touch landing (the
 * `touchstart` timestamp). UIKit counts from the main thread's receipt of the
 * touch, about a frame after the hardware timestamp a browser stamps; a
 * browser's compositor shows a value about a frame after its time, so the two
 * offsets cancel. Scales are fractions of the view's own size; rates are per
 * second.
 *
 * Every leaf carries one or more `@source`; GUESS values also carry the
 * `@measure` task that will confirm or replace them. uikit.test.ts enforces
 * both.
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md,
 * /packages/core/src/ContextMenu/contextMenuPressCurve.ts and
 * /packages/core/src/ContextMenu/contextMenuPress.ts
 */

import {registerMotionTable} from '../roles';

export const contextMenu = {
  press: {
    /**
     * When the press feedback starts: UIKit's press observer
     * (`_UITouchDurationObservingGestureRecognizer`, the context menu's
     * long-press driver) begins, and the size ramp below starts from 1.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, recognizer state log and per-frame platter frames,
     *   Oct 23 2026: the observer began on the first 60 Hz tick after 150 ms
     *   (at 151.0 ms; the tick before, at 134.3 ms, had not), and a linear fit
     *   of the platter's model size over 15 frames crosses 1 at 147.9 ms
     * @measure M-CM6
     */
    feedbackOnsetMs: 150,
    /**
     * When the long press commits: the click haptic plays and the touch
     * belongs to the menu from then on (it is no longer a tap); the menu
     * itself waits for `menuDisplayMs` or the lift.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, recognizer state log, Oct 23 2026: the
     *   clickPresentationExclusion and clickPresentationFailure recognizers
     *   ended on the first 60 Hz tick after 400 ms (at 416.7 ms; the tick
     *   before, at 399.5 ms, had not), the haptic played at 420 ms, and the
     *   platter's size ramp changes slope at 400 ms
     * @measure M-CM6
     */
    commitMs: 400,
    /**
     * How far the finger may drift on either axis, from where it landed,
     * until the menu displays; past it the press ends with no menu. Not the
     * long press's `UIKIT_GESTURES.longPress.allowableMovement` (a distance):
     * a diagonal drift of 15.6 pt still opens the menu.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, drifts at 100, 250 and 500 ms, Oct 23 2026: (7, 7),
     *   (8, 8), (10, 0) and (11, 11) pt open the menu; (12, 0) and (0, 12)
     *   cancel it, before and after the onset alike, and a 30 pt drag after
     *   the commit cancels it too
     * @source GUESS — the value, midway in the measured bracket (11, 12)
     * @measure M-CM3
     */
    allowableMovement: 11.5,
    /**
     * When the menu displays for a finger still down (the delegate's
     * willDisplay, with the backdrop and the menu); until then only the
     * press copy shows, growing on the second ramp. A finger lifted after the
     * commit gets the menu at the lift.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, delegate log and per-frame view tree, Oct 23 2026:
     *   735–738 ms after the touch over five warm presses at random display
     *   phase (734 ms on the first press of a session); a press lifted at
     *   0.5 s displayed at the lift (529 ms)
     */
    menuDisplayMs: 735,
    /**
     * The press feedback's size ramp before the commit: the copy's model
     * scale grows by this much per second from `feedbackOnsetMs` (to 1.04 at
     * the commit).
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, per-frame model frames of the press platter over a
     *   200 × 120 pt view, Oct 23 2026: 0.1594 per second, linear over 15
     *   frames (rms 4e-5), width and height alike
     * @measure M-CM2
     */
    feedbackRate: 0.16,
    /**
     * The ramp after the commit, until the menu takes the copy over: the
     * model scale is 1 + this × the time since the touch landed, continuing
     * the first ramp at the commit (0.16 × 0.25 s = 0.10 × 0.4 s).
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, per-frame model frames of the press platter over a
     *   200 × 120 pt view, Oct 23 2026: 0.1001 per second, linear over 19
     *   frames, zero at the touch (−1.4 ms)
     * @measure M-CM2
     */
    feedbackRateAfterCommit: 0.1,
    /**
     * The spring the copy's visible size chases the ramp with; it starts
     * from rest. The same spring returns the copy to its size when the
     * finger lifts before the commit.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, UIViewSpringAnimationBehavior read at
     *   _animateUsingSpringBehavior:tracking:animations:completion:, Oct 23
     *   2026: damping ratio 0.6, response 0.4, issued every frame from the
     *   begin through the commit and once more for an early lift's return
     */
    feedbackSpring: {response: 0.4, dampingRatio: 0.6},
    /**
     * How much later the screen shows the copy chasing its ramp: the visible
     * size is `feedbackSpring` chasing the ramp started this long after
     * `feedbackOnsetMs`. UIKit writes the ramp on a tick, the spring takes it
     * up on the next, and the screen shows it a tick after that.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, per-frame presentation frames of the press platter at
     *   their display times, a long press and a press lifted at 0.25 s,
     *   Oct 23 2026: `feedbackSpring` from rest chasing the continuous ramp
     *   fits with the ramp shown from 188 ms (rms 0.027 pt over 48 frames)
     * @measure M-CM6
     */
    feedbackLatencyMs: 38,
    /**
     * How much later the screen shows the copy springing back from a lift
     * before the commit.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, the same fit, Oct 23 2026: the press lifted at
     *   266.5 ms (main-thread receipt) springs back from 280.5 ms on screen
     * @measure M-CM6
     */
    returnLatencyMs: 14,
  },
  /**
   * The click haptic at the commit, as a vibration where that is the only
   * haptic (Android browsers). UIKit plays a private pattern
   * (`_UIClickPresentationFeedbackGenerator`) at the commit; iOS Safari can
   * play nothing at that moment, because no tap lands then.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIFeedbackGenerator hook, Oct 23 2026: the click
   *   presentation feedback plays 3 ms after the commit, nothing plays for a
   *   press lifted before it (the moment)
   * @source GUESS — a medium impact stands in for the private pattern (the
   *   kind)
   * @measure M-CM5
   */
  commitHaptic: 'impactMedium',
  /**
   * Reduce Motion: whether the press feedback still grows the view. It does
   * not; only the copy's shadow fades in, and the haptic and the menu stay.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, per-frame platter frames with Reduce Motion on, Prefer
   *   Cross-Fade off and on, Oct 23 2026: the platter stays at scale 1 and
   *   opacity 1 through the hold while its shadow opacity rises 0 → 0.31 by
   *   0.6 s; a press lifted at 0.25 s does not grow either
   */
  reducedMotionFeedback: false,
  lift: {
    /**
     * When the menu shows, the preview grows to this factor at most.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, settled platter frames, Oct 23 2026: a 60 × 60 pt icon
     *   lifts to 69 × 69 (1.15)
     */
    maxScale: 1.15,
    /**
     * Below \`maxScale\`, the preview grows by this many points on its larger
     * side.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, settled platter frames, Oct 23 2026: a 200 × 120 pt
     *   card lifts to 226 × 135.67 (1.13)
     * @source GUESS — the larger side (only landscape-shaped previews were
     *   measured)
     * @measure M-CM9
     */
    scaleUpPoints: 26,
    /**
     * UIKit keeps the lifted preview this far from the screen's sides,
     * shrinking it if it must. Astryx applies the layer runtime's gutter
     * (spec:AST-059), the same 16 px at the sides; kept for the parity record
     * and the geometry tests.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, settled platter frames, Oct 23 2026: a full-width
     *   402 × 60 pt row lifts to 370 × 55.33, centered; a card at x 4 lifts to
     *   x 16, one at x 198 to a right edge at 386
     */
    screenInset: 16,
    /**
     * UIKit keeps the lifted preview this far inside the safe area's top and
     * bottom. Astryx applies the layer runtime's gutter instead (spec:AST-059:
     * the larger of 16 px and the safe area, plus an app's bar), up to 20 px
     * less clearance near a notch; kept for the parity record and the
     * geometry tests.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, settled platter frames, Oct 23 2026: clamped to
     *   y 82…820 (the safe area 62…840, less 20); a card at y 70 lifts to
     *   y 82, one at y 700 to a bottom at 820
     */
    verticalMargin: 20,
    /**
     * The gap between the lifted preview and its menu. The menu goes below
     * the preview when it fits above the bottom limit (the gutter),
     * else above; it is centered on the preview, or flush with its edge when
     * the preview is held against a side.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, settled platter and menu frames for cards at the top,
     *   middle, bottom and both sides, Oct 23 2026: 16 pt either side; the
     *   middle card's menu went below, the bottom card's above
     */
    menuGap: 16,
    /**
     * The menu's entrance and the copy's shadow fade move on this spring; the
     * preview's growth and the backdrop's fade take `springs.contextMenuLift`
     * (0.32, 0.8: fitted to the backdrop's alpha, rms 0.0004, and to the
     * preview's width, 0.05 pt).
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, per-frame morph and platter layers, Oct 23 2026: the
     *   menu content's opacity, blur and scale, the morph container's centre
     *   and the preview shadow's opacity each fit (0.30, 0.80), rms ≤ 0.001;
     *   the issued UIViewSpringAnimationBehaviorSettings are (0.8, 0.3)
     */
    morphSpring: {response: 0.3, dampingRatio: 0.8},
  },
} as const;

/**
 * Registers each visual spring and duration above with the motion registry
 * (motion/roles.ts), where ContextMenu's motion reads them. None is a motion
 * role: touch motion stays internal, so no theme retunes them. The commit, the
 * menu's moment and the onset decide who gets the touch: gesture timing, not
 * motion, so they are not registered. Nothing registers on import:
 * ContextMenu's touch code calls it before its first motion (it is
 * idempotent).
 */
export function registerContextMenuTable(): void {
  registerMotionTable('contextMenu', contextMenu, {
    exclude: ['press.commitMs', 'press.menuDisplayMs', 'press.feedbackOnsetMs'],
  });
}
