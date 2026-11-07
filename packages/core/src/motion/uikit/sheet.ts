// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sheet.ts
 * @input Nothing; data only
 * @output Exports `sheet`, the sheet's release constants. They say when
 *   UISheetPresentationController counts a release as a flick and how near a
 *   detent a flick counts as on it. They also give how far ahead a release is
 *   projected, and the speed below which it is not
 * @position The sheet domain of the UIKit constants table (motion/uikit).
 *   Its springs are `springs.sheetPresent`, `.sheetDismiss`, `.sheetDetent`,
 *   `.sheetReleaseFast` and `.sheetDismissSwipe`
 *
 * Read from UIKit with a `[.medium(), .large()]` sheet in an injected host
 * app. Speeds are in pt/s (CSS px/s).
 *
 * SYNC: When modified, update /packages/core/src/motion/README.md
 */

export const sheet = {
  release: {
    /**
     * Release speed (pt/s, in either direction) from which UIKit's sheet
     * counts a release as a flick. A sheet's flick goes at least to the next
     * position beyond where it is in its direction (`detentTolerance`). It
     * goes on past it when its projection passes it. The same speed
     * switches UIKit's settle from `springs.sheetDetent` (critically damped)
     * to `springs.sheetReleaseFast` (80 % damping). An interactive dismissal
     * at it takes `springs.sheetDismissSwipe`. Inside the measured bracket.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, Oct 23 and Oct 24 2026. Of 134 drag releases, 55 had
     *   their CASpringAnimation read. Every one up to 996.7 pt/s had damping
     *   36.515 (ζ 1), and every one from 1028.3 pt/s on had 29.212 (ζ 0.8).
     *   So the switch lies in (996.7, 1028.3]. With a 0.1 s projection, all
     *   134 outcomes fit a flick threshold from 997 to 1028 pt/s.
     */
    fastSpeed: 1008,
    /**
     * How far ahead a release is projected, as seconds of its velocity.
     * UIKit's sheet projects a release to `offset + velocity × this`, and the
     * dismissed position (fully off screen) counts as one of its positions.
     * A slow release settles on the position nearest this landing. A flick
     * goes to the first position at or past it. Inside the measured bracket.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, Oct 23 to Oct 25 2026. There were 164 drag releases
     *   of a [.medium(), .large()] sheet, from 0 to 4000 pt/s. Each gave the
     *   offset and velocity of its last drag update and the detent it
     *   settled on. With `fastSpeed`'s flick branch and no projection below
     *   250 pt/s, every release fits any value from 0.092 to 0.104 s.
     */
    projectionSeconds: 0.1,
    /**
     * Release speed (pt/s) below which a release is not projected: the sheet
     * settles on the position nearest where it was let go. Core cancels a
     * release that moves back toward its start before this applies. Inside
     * the measured bracket.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, Oct 25 2026. There were 30 releases of drags from the
     *   medium detent. Each went past the midpoint toward large, or most of
     *   the way to gone, then turned back. Each one let go at up to 244 pt/s
     *   settled on the position nearest where it was let go. From 250.6 pt/s
     *   on, the projection decided. So the switch lies in (244, 250.6].
     */
    minProjectionSpeed: 250,
    /**
     * How close to a position (pt) a flick's offset counts as on it, so the
     * next position beyond is the one after it. Inside the measured bracket.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, Oct 24 2026. Two flicks released exactly on the medium
     *   detent went on to the next position in their direction. One released
     *   6.7 pt above it, moving down, stopped at medium. So any value from 0
     *   to 6.6 pt fits.
     */
    detentTolerance: 1,
  },
} as const;
