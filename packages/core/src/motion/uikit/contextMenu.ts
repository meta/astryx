// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file contextMenu.ts
 * @input Measurements of UIContextMenuInteraction on iOS 26.2
 * @output `contextMenu`: UIContextMenuInteraction's touch timeline, drift
 *   tolerance and commit haptic
 * @position The context-menu domain of the UIKit constants table. Only
 *   ContextMenu's own modules import it. The table's barrel does not
 *   re-export it.
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md and
 * /packages/core/src/ContextMenu/contextMenuPress.ts
 */

/**
 * UIContextMenuInteraction's touch timeline on iOS 26.2. A context menu is not
 * a plain long press. A finger that rests on the view starts a press feedback
 * after 150 ms. A copy of the view grows uniformly, and its size follows a
 * linear ramp through a spring. At 400 ms the press commits. The click haptic
 * plays, and the touch can no longer become a tap. The menu displays at 735 ms
 * if the finger is still down, or at the lift after the commit. A finger that
 * lifts before the commit gets no menu, and the copy springs back. A finger
 * that drifts too far before the menu displays gets the same.
 *
 * UIKit runs this on display-link ticks. So a 60 Hz screen shows each moment
 * on the first frame after it: the feedback at 151 ms, the commit at 417 ms.
 * The times here are the moments themselves, from the `touchstart` timestamp.
 * UIKit counts from the main thread's receipt of the touch, about a frame
 * after the hardware timestamp that a browser stamps. A browser's compositor
 * shows a value about a frame after its time, so the two offsets cancel.
 * Scales are fractions of the view's own size. The lift and dismissal springs
 * are `springs.contextMenuLift` and `springs.contextMenuDismiss`.
 *
 * Every leaf has one or more `@source`. A GUESS value also has the `@measure`
 * task that confirms or replaces it. uikit.test.ts enforces both.
 */
export const contextMenu = {
  press: {
    /**
     * When the long press commits. The click haptic plays, and from then on
     * the touch belongs to the menu, not to a tap. The menu itself waits for
     * `menuDisplayMs` or the lift.
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
     * When the menu displays for a finger that is still down: the delegate's
     * willDisplay, with the backdrop and the menu. Until then, only the press
     * copy shows, and it grows on the second ramp. A finger lifted after the
     * commit gets the menu at the lift.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, delegate log and per-frame view tree, Oct 23 2026:
     *   735–738 ms after the touch over five warm presses at random display
     *   phase (734 ms on the first press of a session); a press lifted at
     *   0.5 s displayed at the lift (529 ms)
     */
    menuDisplayMs: 735,
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
} as const;
