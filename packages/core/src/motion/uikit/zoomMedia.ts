// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file zoomMedia.ts
 * @input The motion registry (motion/roles.ts)
 * @output Exports `zoomMedia`: UIScrollView zooming in a photo viewer. It
 *   holds the give past the zoom limits, and Photos' double tap, maximum
 *   zoom, page gap and drag to dismiss. `registerZoomMediaTable` makes the
 *   dismissal's two springs motion roles
 * @position A domain of the UIKit constants table (motion/uikit). Lightbox's
 *   zoom stage reads it
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md
 */

import {registerMotionTable} from '../roles';

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
  viewer: {
    /**
     * In Photos, a double tap at the fitted size zooms until the photo fills
     * the stage (aspect fill). A 402 × 268 landscape photo on the 874 pt tall
     * screen zooms 3.261×, and a 402 × 603 portrait 1.449×. Photos brings the
     * tapped point to the centre, kept inside the stage. A double tap while
     * zoomed returns to the fitted size. Both run UIKit's zoom settle.
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
  dismiss: {
    /**
     * While a photo at its fitted size is dragged down, its centre follows
     * the finger. It shrinks about that centre by 1 − k·d², where d is the
     * drag's downward travel in pt. It gives 0.997 / 0.978 / 0.942 / 0.899 at
     * 25 / 65 / 105 / 145 pt, with k the least-squares fit, within 0.004.
     * @source measured: Photos, iOS 26.2 simulator, iPhone 17 Pro, a 3000 ×
     *   2000 photo at its fitted size dragged down 25–145 pt, the zoom
     *   view's bounds per frame, Oct 24 2026
     */
    scalePerTravelSquared: 4.91e-6,
    /**
     * The viewer's backdrop fades by 1 − k·d²: 1.0 / 0.95 / 0.86 / 0.71 at
     * 25 / 65 / 105 / 145 pt (k the least-squares fit, within 0.009).
     * @source measured: Photos, iOS 26.2 simulator, iPhone 17 Pro, the same
     *   drags, the backdrop view's alpha per frame, Oct 24 2026
     */
    backdropAlphaPerTravelSquared: 1.35e-5,
    /**
     * The neighbouring photos and the controls fade faster, linearly once
     * the drag passes `chromeFadeStart`: 1 − k·(d − start). It gives 0.96 /
     * 0.76 / 0.52 / 0.33 at 25 / 65 / 105 / 145 pt, fitted within 0.016.
     * @source measured: Photos, iOS 26.2 simulator, iPhone 17 Pro, the same
     *   drags, the neighbouring pages' and the chrome's alpha per frame,
     *   Oct 24 2026
     */
    chromeAlphaPerPoint: 0.00533,
    /**
     * Travel, pt, before the controls start to fade (see
     * `chromeAlphaPerPoint`).
     * @source measured: Photos, iOS 26.2 simulator, iPhone 17 Pro, the
     *   intercept of the same fit, Oct 24 2026
     */
    chromeFadeStart: 17.8,
    /**
     * The commit point. A release whose projected travel (`projectionRate`)
     * stays within this distance of where the drag started cancels, as a
     * release moving up does. Any other release dismisses, however short the
     * pull. Pulls of 20, 40 and 60 pt held still, then lifted, dismiss. A pull
     * brought back to about 5 pt cancels.
     * @source GUESS — between the measured 5 pt (cancels) and 20 pt
     *   (dismisses); Photos, iOS 26.2 simulator, Oct 24 2026
     * @measure M-ZM3
     */
    cancelTravel: 10,
    /**
     * The deceleration rate that projects a release's travel. The drag
     * dismisses when its travel plus where its velocity would coast passes
     * `cancelTravel`, so a short flick down closes.
     * @source GUESS — UIScrollView's normal deceleration rate, the WWDC18
     *   projection's default; Photos' own projection is not measured
     * @measure M-ZM5
     */
    projectionRate: 0.998,
    /**
     * The dismissal's position spring (critically damped, response about
     * 0.21 s): the photo leaves along it.
     * @source measured: Photos, iOS 26.2 simulator, iPhone 17 Pro, a
     *   committed drag-to-dismiss, the zoom view's position animation
     *   (`CASpringAnimation` mass 1, stiffness 918.09, damping 60.60),
     *   Oct 24 2026
     */
    dismissPositionSpring: {mass: 1, stiffness: 918.09, damping: 60.6},
    /**
     * The dismissal's spring for size and opacity (critically damped).
     * @source measured: Photos, iOS 26.2 simulator, iPhone 17 Pro, the same
     *   dismissal, the bounds and opacity animations (stiffness 947.14,
     *   damping 61.55), Oct 24 2026
     */
    dismissSizeSpring: {mass: 1, stiffness: 947.14, damping: 61.55},
  },
} as const;

/**
 * Registers this table with the motion registry (motion/roles.ts). The
 * dismissal's two springs are roles, so the exit plays at the tempo of the
 * viewer's theme, as every other viewer motion does. At tempo 1 they play
 * exactly their measured values. The table's other values play as measured.
 * The module registers its own table at import (one idempotent in-memory
 * write, no DOM).
 */
export function registerZoomMediaTable(): void {
  registerMotionTable('zoomMedia', zoomMedia, {
    roles: ['dismiss.dismissPositionSpring', 'dismiss.dismissSizeSpring'],
  });
}

registerZoomMediaTable();
