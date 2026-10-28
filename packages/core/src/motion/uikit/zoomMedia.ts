// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file zoomMedia.ts
 * @input Nothing; data only
 * @output Exports `zoomMedia`: UIScrollView zooming in a photo viewer. That
 *   is the give past the zoom limits, the settle's curve and duration law,
 *   and Photos' double tap, maximum zoom and gap between pages
 * @position A domain of the UIKit constants table (motion/uikit). Lightbox's
 *   zoom stage reads it. Its three settle lengths are internal motion roles
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md
 */

import {registerMotionTable} from '../roles';
import {timing} from './timing';

/**
 * UIScrollView zooming as a photo viewer uses it, with Photos' double tap
 * and maximum zoom. Re-exported from motion/uikit, inside core.
 *
 * Measured on the iOS 26.2 simulator (iPhone 17 Pro, 402 × 874 pt at 3×).
 * The lab was a UIKit host app with a full-screen UIScrollView zooming one
 * image view (minimum zoom = fit, maximum 4, bouncesZoom on). Photos was
 * measured on 3000 × 2000 and 2000 × 3000 photos. Real HID touches drove
 * both, and every `CAAnimation`, zoomScale and contentOffset was logged.
 *
 * Findings with no number: inside the limits, the zoom equals the pinch's
 * scale 1:1. The content point under the fingers' centroid stays under it
 * (within 1 pt), past the limits too. A pinch released inside the limits
 * keeps no scale momentum. A two-finger tap does nothing. The double tap
 * fires on the second lift, with no wait.
 *
 * Every leaf carries one or more `@source`. WebKit and GUESS values also
 * carry the `@measure` task that will confirm or replace them, and
 * uikit.test.ts enforces both.
 */
export const zoomMedia = {
  overshoot: {
    /**
     * Past a zoom limit the zoom gives way. Past the maximum M it reads
     * M·(f − (f − 1)·M ÷ s). Past the minimum m it reads
     * m ÷ (f − (f − 1)·s ÷ m), where s is the pinch's own scale. With f = 2,
     * the zoom leaves the limit at the pinch's pace and approaches f times the
     * limit (2M, m ÷ 2). Pinches of 4.5, 5, 5.5 and 6 past a maximum of 4 read
     * 4.444, 4.8, 5.091 and 5.333. Pinches of 0.85, 0.7, 0.474 and 0.323 past
     * a minimum of 1 read 0.870, 0.769, 0.655 and 0.596.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, zoomScale against the pinch recognizer's scale per
     *   event, Oct 23 2026
     */
    limitFactor: 2,
  },
  settle: {
    /**
     * The curve of the return from past a limit, and of `zoom(to:animated:)`
     * and `setZoomScale(_:animated:)`. UIKit runs one CABasicAnimation,
     * easeInEaseOut, on the image view's transform and position and the scroll
     * view's bounds. This is the `timing.curves.move` leaf itself, so the
     * settle plays that role. Zoom and offset move together on it.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAAnimation read (timing function control points),
     *   Oct 23 2026
     */
    curve: timing.curves.move,
    /**
     * Its length, ms, is this plus `lnRatioMs` × |ln(zoom ratio)|. So
     * 5.333 → 4 lasts 186 ms, 4.8 → 4 lasts 155 ms, and 0.596 → 1 lasts
     * 255 ms.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAAnimation durations of releases past the limits and
     *   of zoom(to:animated:), Oct 23 2026
     */
    baseMs: 100,
    /**
     * See `baseMs`.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAAnimation durations of releases past the limits and
     *   of zoom(to:animated:), Oct 23 2026
     */
    lnRatioMs: 300,
    /**
     * `zoom(to:animated:)` never takes longer than this, ms. 1 ↔ 2.5 takes
     * 375 ms, and a rect 4 times smaller takes 400 ms. Photos' double tap
     * from 1 to 3.261 shows about 420 ms of motion.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, CAAnimation durations of zoom(to:animated:) and
     *   setZoomScale(_:animated:), Oct 23 2026
     */
    maxMs: 400,
  },
  viewer: {
    /**
     * In Photos, a double tap at the fitted size zooms until the photo fills
     * the stage (aspect fill). A 402 × 268 landscape photo on the 874 pt tall
     * screen zooms 3.261×, and a 402 × 603 portrait 1.449×. Photos brings the
     * tapped point to the centre, kept inside the stage. A double tap while
     * zoomed returns to the fitted size. Both run `settle`.
     * @source measured: Photos, iOS 26.2 simulator, iPhone 17 Pro,
     *   zoomScale and contentOffset per frame after double taps at the
     *   centre and near the edge of 3000 × 2000 and 2000 × 3000 photos,
     *   Oct 23 2026
     */
    doubleTapZoom: 'aspectFill',
    /**
     * The maximum zoom is this many times the zoom at which one image pixel
     * covers one device pixel. That gives 14.93 for a 3000 × 2000 photo fitted
     * 402 pt wide at 3×, and 9.95 for 2000 × 3000.
     * @source measured: Photos, iOS 26.2 simulator, iPhone 17 Pro, the
     *   zoomScale a pinch settles on past the maximum, 3000 × 2000 and
     *   2000 × 3000 photos, Oct 23 2026
     */
    maxPixelZoomMultiple: 6,
    /**
     * Space between photos while they page, pt: the pager's stride is the
     * screen's width plus this (442 on the 402 pt screen). It shows only
     * while a page moves.
     * @source measured: Photos, iOS 26.2 simulator, iPhone 17 Pro, the
     *   pager's contentOffset per page, Oct 23 2026
     */
    pageGap: 40,
  },
} as const;

/**
 * Registers the zoom settle's three lengths as internal motion roles.
 * Nothing registers on import: the zoom stage calls it before its first
 * settle, and a second call does nothing. The settle's curve is the
 * `timing.curves.move` role.
 */
export function registerZoomMediaTable(): void {
  registerMotionTable('zoomMedia', zoomMedia, {
    roles: ['settle.baseMs', 'settle.lnRatioMs', 'settle.maxMs'],
  });
}
