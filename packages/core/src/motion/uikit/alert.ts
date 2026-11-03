// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file alert.ts
 * @input Nothing: plain data
 * @output Exports `alertController`: how UIAlertController (`.alert`)
 *   appears, how wide it is, and how it tracks a finger across its actions.
 *   None of it is a motion role: the alert plays the theme's dialog motion
 * @position The alert domain of the UIKit constants table (motion/uikit)
 *
 * Every value was read from UIKit on the iOS 26.2 simulator. A host app
 * presented `UIAlertController(.alert)` with two and with three actions.
 * Real HID touches drove it, and the action views' highlight was sampled
 * every frame. Lengths are in pt (CSS px), durations in ms.
 *
 * Every leaf carries one or more `@source`; GUESS values also carry the
 * `@measure` task that will confirm or replace them. uikit.test.ts enforces
 * both.
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md
 */

export const alertController = {
  /**
   * The alert's width, in pt. It is fixed in portrait and landscape, and the
   * height follows the content. AlertDialog takes it by default on a phone.
   * At the presentation's 1.2 start it stays on screen (384 of 402 pt).
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, `UIAlertController(.alert)` view frames across 22
   *   portrait and landscape cases (every alert 320 pt wide; action row
   *   288 pt inside 16 pt insets), Oct 24 2026
   */
  width: 320,
  present: {
    /**
     * The alert appears from this scale to 1 and fades in from opacity 0, and
     * the dimming view fades in with it. Nothing translates. It leaves by a
     * fade alone, at scale 1. Under Reduce Motion the scale is dropped. An
     * alert wider than UIKit's starts at most as wide as the viewport.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAAnimation dump of the alert view (transform scale,
     *   additive, 1.2 to 1; opacity 0 to 1) and the dimming view (opacity
     *   0 to 1), and again with Reduce Motion on (no scale animation); the
     *   dismissal animated opacity only, Oct 23 2026
     */
    scaleFrom: 1.2,
  },
  actions: {
    /**
     * How long after touch-down the touched action highlights: none, it is
     * highlighted in the touch-down frame (a tap and a 300 ms hold alike).
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, per-frame highlight of the action views under real HID
     *   touches, Oct 23 2026
     */
    highlightOnsetMs: 0,
    /**
     * How far outside an action the finger may go and keep it highlighted:
     * none. The highlight cleared 1 pt below the action, and a lift there ran
     * nothing. UIButton keeps 70 pt; an alert action does not.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, per-frame highlight of the action views under real HID
     *   touches, Oct 23 2026
     */
    highlightExpansion: 0,
  },
} as const;
