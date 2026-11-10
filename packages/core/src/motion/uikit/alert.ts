// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file alert.ts
 * @input Nothing; data only
 * @output Exports `alertController`: how UIAlertController (`.alert`) tracks
 *   a finger across its actions
 * @position The alert domain of the UIKit constants table (motion/uikit);
 *   its springs are `springs.alertPresent` and `springs.alertDismiss`
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
