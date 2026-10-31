// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file sheet.ts
 * @input Nothing; data only
 * @output Exports `sheet`: how UISheetPresentationController resolves a
 *   drag's release, the target projection and the speed that picks the
 *   release spring, and the rubber band past the tallest detent
 * @position The sheet domain of the UIKit constants table (motion/uikit);
 *   its springs are `springs.sheetPresent`, `.sheetDismiss`, `.sheetDetent`,
 *   `.sheetReleaseFast` and `.sheetDismissSwipe`
 *
 * Read from UIKit with a `[.medium(), .large()]` sheet in an injected host
 * app on the iOS 26.2 simulator: the release velocity UIKit computed, the
 * offset it released at and the detent it settled on, for 164 releases, and
 * the `CASpringAnimation` it attached for the 55 of the first 134 whose
 * spring was read. Speeds are in pt/s (CSS px/s); times in seconds.
 *
 * Every leaf carries one or more `@source`; webkit and GUESS values also carry
 * the `@measure` task that will confirm or replace them. uikit.test.ts
 * enforces both.
 *
 * SYNC: When modified, update /packages/core/src/motion/README.md
 */

export const sheet = {
  release: {
    /**
     * How far ahead a release is projected, as seconds of its velocity: from
     * `minProjectionSpeed` to `fastSpeed` the sheet settles on the position
     * nearest `offset + velocity × this`, the dismissed position (fully off
     * screen) counting as one of them. Slower, and at rest, the nearest
     * position.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, 164 drag releases of a [.medium(), .large()] sheet
     *   between 0 and 4000 pt/s (offset and velocity of the sheet
     *   interaction's last drag update before the lift, outcome from the
     *   detent it settled on), 47 on Oct 23 and 87 on Oct 24 2026 placed to
     *   separate the candidate laws, and 30 back-outs on Oct 25 2026 (see
     *   `minProjectionSpeed`): with `fastSpeed`'s flick branch and
     *   `minProjectionSpeed`, every release fits for any value from 0.092 to
     *   0.104 s. Of the first 134, a single linear projection fits at most
     *   122 (at 0.103 s), and a quadratic one (offset + k·v·|v|) at most 126
     */
    projectionSeconds: 0.1,
    /**
     * Release speed (pt/s, in either direction) below which a release is not
     * projected: the sheet settles on the position nearest where it was let
     * go, whichever way it was moving. UIKit's sheet, turned back toward
     * where it started and let go slowly, stays with the position it is
     * nearest; the BottomSheet's rule cancels such a back-out instead
     * (`spec:AST-094` FR37, BottomSheet/sheetRelease.ts). Inside the measured
     * bracket.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, 30 releases on Oct 25 2026 of drags from the medium
     *   detent that went past the midpoint toward large, or 90 % of the way
     *   to gone, then turned back toward medium. The seven past the
     *   midpoint, let go at 60 to 244 pt/s, settled on large, and the six
     *   near gone, let go at 96 to 264 pt/s, dismissed: each the position
     *   nearest where it was let go, where a dismissal's projection lands
     *   too. Past the midpoint, from 250.6 pt/s on, the projection decided
     *   (back to medium), so the speed lies in (243.6, 250.6]
     */
    minProjectionSpeed: 250,
    /**
     * Release speed (pt/s, in either direction) from which a release is a
     * flick: it goes at least to the next position beyond where it is in
     * its direction (`detentTolerance`), or to the projection's nearest
     * position if that is farther. The same speed switches the settle from
     * `springs.sheetDetent` (critically damped) to `springs.sheetReleaseFast`
     * (80 % damping); an interactive dismissal at it takes
     * `springs.sheetDismissSwipe`. Inside the measured bracket.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, 134 drag releases, 55 of them with the
     *   CASpringAnimation UIKit attached (29 of the 47 on Oct 23, 26 of the
     *   87 on Oct 24 2026): damping 36.515 (ζ 1) at every read release up to
     *   996.7 pt/s and 29.212 (ζ 0.8) at every one from 1028.3 pt/s on
     *   (`d-45.v-1000`, then 1088.7, 1090.0 and 1122.4 pt/s and faster), so
     *   the spring reads alone bracket the switch to (996.7, 1028.3]; with the
     *   0.1 s projection the outcomes of all 134 fit the flick branch for a
     *   threshold from 997 to 1028 pt/s, the same bracket
     */
    fastSpeed: 1008,
    /**
     * How close to a position (pt) a flick's offset counts as on it, so the
     * next position beyond is the one after it. Inside the measured bracket.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, the 134 releases: two flicks released exactly on the
     *   medium detent go on to the next position in their direction, and one
     *   released 6.7 pt above it moving down stops at medium, so any value
     *   from 0 to 6.6 pt fits, Oct 24 2026
     */
    detentTolerance: 1,
  },
  rubberBand: {
    /**
     * The rubber band a finger's drag past the tallest detent runs:
     * (1 − 1 ÷ (x·c ÷ d + 1))·d, with x the finger's travel past it and d the
     * sheet's height (`spec:AST-094` FR3; motion/rubberBand.ts). UIKit's
     * own sheet reports this coefficient but holds at its largest detent.
     * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
     *   iPhone 17 Pro, the sheet interaction's `rubberBandCoefficient` read
     *   when each drag began: 0.55 on every one of 43 drags of a
     *   [.medium(), .large()] sheet, 13 on Oct 23 and 30 on Oct 25 2026
     */
    coefficient: 0.55,
  },
} as const;
