// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file button.ts
 * @input `timing` (UIButton's measured release clock and UIKit's named curves)
 * @output Exports `button`: the clocks and curves of UIButton (the highlight's
 *   release after the finger lifts)
 * @position The button domain of the UIKit constants table (motion/uikit);
 *   read by utils/interactionOverlay.stylex.ts (a control's press paint) through its
 *   build-time mirror, and by the press model's control profile (the clock
 *   that removes the release attribute)
 *
 * Every leaf carries one or more `@source`; GUESS values also carry the
 * `@measure` task that will confirm or replace them (MEASUREMENTS.md).
 * uikit.test.ts enforces both. Durations are in ms; curves are cubic-bézier
 * control points [x1, y1, x2, y2].
 *
 * SYNC: When modified, update:
 * - /packages/core/src/utils/controlPressLayer.stylex.ts (`controlPressConsts`
 *   mirrors the control release; pressFeedback.test.ts checks it)
 */

import {timing} from './timing';

export const button = {
  highlight: {
    /**
     * After the finger lifts, a button's highlight leaves over this long: the
     * filled configuration's label cross-fade and background colour both run
     * it.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAAnimation read (CATransition fade and
     *   backgroundColor), Oct 23 2026 (timing.press.buttonReleaseMs)
     */
    releaseMs: timing.press.buttonReleaseMs,
    /**
     * The release's curve: both animations of the release run UIKit's
     * easeInEaseOut.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAAnimation read (CATransition fade and
     *   backgroundColor), Oct 23 2026 (timing.curves.move)
     */
    releaseCurve: timing.curves.move,
  },
} as const;
