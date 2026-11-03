// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file searchMotion.ts
 * @input Measurements of UIKit's search bar on the iOS 26.2 simulator
 * @output `search`: UISearchController's activation clock, the stacked and
 *   bottom fields' geometry, and the close and clear buttons
 * @position Lab's measured values for iOS 26's search bar. Only Lab reads
 *   them, so they stay in Lab and not in Core's UIKit tables.
 *
 * SYNC: When modified, update searchMotion.test.ts.
 */

/**
 * UISearchController's search bar: activation, cancel, geometry and
 * placements. Every leaf names its source in `@source`. A `measured` value
 * comes from the UIKit lab: an injected host app on the iOS 26.2 simulator,
 * iPhone 17 Pro.
 */
export const search = {
  /**
   * The activation's clock, in ms. One UIViewPropertyAnimator moves the
   * field, its width, the close button and the large title. It runs on
   * UIKit's ease-in-ease-out, the `timing.curves.move` role, whose control
   * points are the animator's UICubicTimingParameters. Cancel runs the same
   * animator backwards over the same time.
   * @source measured: UIViewPropertyAnimator duration and
   *   UICubicTimingParameters read at setup, and the field's frame per frame
   *   (rms 1.5 % against this clock and curve)
   */
  activationMs: 383.3,
  // Reduce Motion: UIKit keeps the activation's travel with or without
  // Prefer Cross-Fade Transitions, measured in the same lab. Astryx's own
  // reduced-motion handling decides instead, so the table has no setting for
  // it.
  stacked: {
    /**
     * The stacked field's height, pt.
     * @source measured: UISearchTextField frame (370 × 44 at x 16)
     */
    fieldHeight: 44,
    /**
     * The field's inset from each side of its container, pt (370 wide on a
     * 402 pt screen).
     * @source measured: UISearchTextField frame
     */
    fieldInset: 16,
    /**
     * The glass close button that replaces iOS 18's Cancel text: a square of
     * this side, pt, at the trailing inset.
     * @source measured: the close UIButton's frame (44 × 44 at x 342)
     */
    closeSize: 44,
    /**
     * The gap between the active field and the close button, pt. The active
     * field narrows to the container's width minus the two insets, this gap
     * and the button (315 on a 402 pt screen).
     * @source measured: the active field (x 16, 315 wide) and the close button
     *   (x 342)
     */
    closeGap: 11,
    /**
     * How far past its resting place the close button starts, toward the
     * trailing edge, pt. It slides in from there while its opacity goes 0 → 1,
     * both on the activation's curve. On cancel it slides back out at full
     * opacity and is removed at the end.
     * @source measured: the close button's frame and alpha per frame (x 386 →
     *   342, alpha 0 → 1; cancel 342 → 386 at alpha 1)
     */
    closeTravel: 44,
  },
  bottom: {
    /**
     * The bottom (toolbar) field's height at rest, pt. It is 336 wide at the
     * bottom of a 402 pt screen. A tab bar's search tab has its own glass
     * geometry, which belongs with the tab bar's values.
     * @source measured: the `.integrated` field's frame (336 × 38 at y 803)
     */
    fieldHeight: 38,
    /**
     * While active, the field's centre stays this far above the keyboard's
     * top edge, pt (a 17 pt gap), on every frame. The bar rides the
     * keyboard's own spring (`springs.keyboard`). Only the bottom field was
     * measured, so this value makes no claim about a tab bar's search field.
     * @source measured: the bar container's additive CASpringAnimation on
     *   position, the keyboard's spring. The field's centre against the
     *   keyboard per frame (y 503, keyboard top 539).
     */
    keyboardCenterOffset: 36,
    /**
     * The active field's width, pt, beside the close button.
     * @source measured: the `.integrated` field's frame once settled
     */
    activeWidth: 308,
    /**
     * The resting field's inset from each side of the screen, pt. It sits
     * 33 pt above the screen's bottom edge. While the keyboard hides, the bar
     * keeps that gap above it, so the field's centre is 52 pt above the
     * keyboard's top.
     * @source measured: the field's frame at rest (x 33, 336 wide) and per
     *   frame against the keyboard during the hide
     */
    restInset: 33,
    /**
     * The active field's leading inset, pt. The close button keeps the same
     * inset from the trailing edge.
     * @source measured: the active field at x 17 and the close button ending
     *   17 pt from the trailing edge
     */
    activeInset: 17,
    /**
     * The close button's side, pt (a 38 pt button in a 48 pt glass).
     * @source measured: `_UIButtonBarButton` 38 × 38 at (347, 484)
     */
    closeSize: 38,
    /**
     * Between the active field and the close button, pt.
     * @source measured: the field ending at x 325 and the close button starting
     *   at x 347
     */
    closeGap: 22,
    /**
     * At a cancel's start the active field narrows by this much on each side,
     * pt. The close button moves this much toward it, before the field springs
     * out to rest.
     * @source measured: the field at x 33, 276 wide, and the close button's
     *   centre at x 350 on the hide's first frame (two runs)
     */
    cancelNarrowing: 16,
    /**
     * The activation's gel, per 60 Hz frame from the activation animator's
     * start. The columns are [ms, leading-edge progress, trailing-edge
     * progress, height scale], with progress 0 at rest and 1 active. SwiftUI
     * sets these frames each frame with no animation object, so the measured
     * frames are the curve. The field swells, then narrows past its place and
     * settles.
     * @source measured: the field's frame per frame from the animator's setup
     */
    // prettier-ignore
    activationFrames: [[0, 0, 0, 1], [66, 1.076, -0.365, 1.003], [87, 1.008, -0.35, 0.999], [103, 0.994, -0.203, 0.998], [120, 1.099, -0.019, 1.076], [137, 1.201, 0.183, 1.152], [153, 1.243, 0.387, 1.162], [170, 1.206, 0.581, 1.115], [187, 1.146, 0.742, 1.059], [203, 1.042, 0.877, 1.014], [220, 0.994, 0.96, 0.989], [237, 0.946, 1.017, 0.979], [253, 0.933, 1.043, 0.979], [270, 0.931, 1.052, 0.983], [287, 0.938, 1.051, 0.989], [303, 0.952, 1.043, 0.994], [320, 0.964, 1.033, 0.997], [337, 0.978, 1.024, 0.998], [353, 0.986, 1.016, 0.999], [370, 0.993, 1.002, 0.999], [387, 0.996, 1.002, 0.999], [403, 0.999, 1, 1], [420, 0.999, 1, 1], [437, 0.999, 1, 1], [453, 1, 1, 1]],
    /**
     * The cancel's gel from the keyboard's start, in the same columns. The
     * trailing edge starts `cancelNarrowing` inside the active field's and
     * springs out past its rest. The field swells up to 1.2 times its height.
     * @source measured: the field's frame per frame from the hide's start (two
     *   runs)
     */
    // prettier-ignore
    cancelFrames: [[0, 0, 1.364, 1], [17, 0, 1.364, 1], [34, 0, 1.252, 1], [51, -0.004, 0.948, 1.079], [67, -0.007, 0.631, 1.144], [84, -0.009, 0.351, 1.191], [101, -0.009, 0.15, 1.2], [117, -0.009, 0.001, 1.202], [134, -0.009, -0.103, 1.176], [151, -0.008, -0.142, 1.119], [167, -0.006, -0.128, 1.052], [184, -0.003, -0.094, 1.02], [201, -0.001, -0.058, 0.992], [217, 0, -0.031, 0.985], [234, 0.001, -0.013, 0.984], [251, 0.001, -0.003, 0.988], [267, 0.001, 0, 0.994], [284, 0.001, 0.001, 0.997], [301, 0, 0, 1]],
    /**
     * The close button's entrance from the activation animator's start: [ms,
     * opacity, scale, x offset pt]. It rides hidden inside the field's
     * trailing end. Then it grows from 7.6 pt, fades in and moves out to its
     * place, and overshoots to 39.3 pt. SwiftUI plays it with no animation
     * object.
     * @source measured: `_UIButtonBarButton` frame and effective opacity per
     *   frame
     */
    // prettier-ignore
    closeEnterFrames: [[0, 0, 0.2, -16.67], [153, 0, 0.238, -16.67], [170, 0.024, 0.257, -16.26], [187, 0.067, 0.287, -15.55], [203, 0.157, 0.348, -14.05], [220, 0.228, 0.396, -12.86], [237, 0.342, 0.474, -10.96], [253, 0.42, 0.53, -9.67], [270, 0.532, 0.615, -7.81], [287, 0.602, 0.671, -6.64], [303, 0.698, 0.75, -5.04], [320, 0.755, 0.798, -4.09], [337, 0.829, 0.861, -2.85], [353, 0.871, 0.896, -2.15], [370, 0.923, 0.939, -1.28], [387, 0.958, 0.966, -0.7], [403, 0.985, 0.988, -0.25], [420, 1, 1.005, 0.1], [437, 1, 1.015, 0.31], [453, 1, 1.025, 0.52], [470, 1, 1.029, 0.61], [487, 1, 1.033, 0.68], [503, 1, 1.033, 0.7], [520, 1, 1.033, 0.68], [537, 1, 1.031, 0.65], [553, 1, 1.028, 0.59], [570, 1, 1.026, 0.54], [587, 1, 1.022, 0.46], [603, 1, 1.019, 0.41], [620, 1, 1.016, 0.33], [637, 1, 1.013, 0.27], [653, 1, 1.011, 0.22], [670, 1, 1.008, 0.16], [687, 1, 1.006, 0], [703, 1, 1, 0]],
    /**
     * The close button's exit from the keyboard's start: [ms, opacity,
     * scale]. It stays where `cancelNarrowing` put it and swells from the tap.
     * Then it shrinks and fades as the field covers it.
     * @source measured: `_UIButtonBarButton` frame and effective opacity per
     *   frame (two runs)
     */
    // prettier-ignore
    closeExitFrames: [[0, 1, 1.069], [17, 1, 1.387], [34, 0.918, 1.282], [51, 0.76, 1.083], [67, 0.581, 0.861], [84, 0.414, 0.66], [101, 0.274, 0.497], [117, 0.167, 0.376], [134, 0.089, 0.291], [151, 0.037, 0.236], [167, 0.005, 0.201], [184, 0, 0.182]],
  },
  clear: {
    /**
     * The clear button's side inside the field, pt. It appears and disappears
     * at once, with no fade. A tap clears the text without moving the
     * keyboard. Tapped while the field is not editing, it also makes the field
     * first responder.
     * @source measured: `_UITextFieldClearButton` frame and alpha per frame,
     *   and UIKeyboardWillShow 75 ms after a tap while not editing
     */
    size: 20,
  },
} as const;
