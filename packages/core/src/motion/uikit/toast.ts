// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file toast.ts
 * @input Nothing; data only
 * @output Exports `toast`: the iOS 26.2 notification banner's follow,
 *   release and exit values for a Toast under a finger. Each has its
 *   `@source` (method B in MEASUREMENTS.md)
 * @position The Toast domain of the UIKit constants table (motion/uikit)
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md and
 *   /packages/core/src/Toast/useToastBannerSwipe.ts.
 */

export const toast = {
  /**
   * Finger travel since touch-down, toward the edge or back away from it,
   * before the banner starts to move with it. The pan itself begins earlier,
   * at UIKit's pan hysteresis (`UIKIT_GESTURES.pan.hysteresis`), so a quick
   * flick shorter than this still counts. The travel before it never moves
   * the banner, so the banner does not jump when it starts to follow.
   * @source measured: SpringBoard notification banner, iOS 26.2 simulator,
   *   60 fps recordings of HID drags, banner y per frame against the touch
   *   stream: slow drags of 20 to 70 pt, up or down, move it 0.55 ×
   *   (travel − 14), with
   *   the display's 1 to 3 frames of lag corrected (17 pt uncorrected), Oct
   *   23 2026
   */
  followFrom: 14,
  /**
   * How far the banner moves per pixel the finger travels past `followFrom`,
   * toward the edge or away from it. Away from the edge the banner stretches
   * and springs back. Past ~75 pt it would open its expanded view, which a
   * toast does not have.
   * @source measured: SpringBoard notification banner, iOS 26.2 simulator,
   *   60 fps recordings of HID drags up to 60 pt toward the edge and 70 pt
   *   away from it, linear (a rubber band fits worse), Oct 23 2026
   */
  followRatio: 0.55,
  /**
   * How much more vertical than horizontal a drag must be before it can
   * begin. A horizontal drag is left to the page and never moves the banner.
   * @source GUESS — the value Toast shipped with: a thumb's arc is not a
   *   direction until it is 1.2 times more vertical than horizontal; a
   *   horizontal 60 pt drag leaves the banner where it is (measured, 60 fps
   *   recording)
   * @measure M-T2
   */
  axisRatio: 1.2,
  /**
   * How far from rest (px toward the edge) the card must be at the lift for
   * a release to dismiss it, whatever the finger's speed.
   * @source measured: SpringBoard notification banner, iOS 26.2 simulator,
   *   60 fps recordings of slow (60 pt/s) HID drags lifted while moving: 40 pt
   *   (0.55 × (40 − 14) = 14.3 out) settles, 45 pt (17.1 out) dismisses, as
   *   do longer ones; the midpoint, Oct 23 2026
   */
  dismissOffset: 15.7,
  /**
   * The finger's release speed toward the edge (px/s), from which a release
   * dismisses, however little the card moved. The speed is the shared release
   * filter's. The banner keeps a stopped finger's last speed. The filter reads
   * 0 once the finger rested past its stillness interval before the lift, so
   * such a release springs back here.
   * @source measured: SpringBoard notification banner, iOS 26.2 simulator,
   *   60 fps recordings of HID releases: slow drags at up to 82 pt/s settle;
   *   10 and 15 pt flicks at 129 to 245 pt/s dismiss, also after the finger
   *   stood still 33 to 150 ms before the lift; the midpoint, Oct 23 2026
   */
  flickVelocity: 105,
  /**
   * How long the banner takes to leave. After a dismissing release, its
   * timeout or anything else that dismisses it, it retracts past the top
   * edge from wherever it is, without fading. On a phone with the Dynamic
   * Island it shrinks into the island, which a web toast must not imitate.
   * So the card slides past its edge on the same timing and keeps its size.
   * @source measured: SpringBoard notification banner, iOS 26.2 simulator,
   *   60 fps recordings: two timeouts take its bottom edge from rest to the
   *   top edge in 148 to 163 ms; after a release 24.7 pt up it is gone 170
   *   to 185 ms after the lift, display lag included, Oct 23 2026
   */
  exitMs: 160,
  /**
   * The retract's timing curve over `exitMs`: it starts slowly and leaves
   * fast.
   * @source measured: SpringBoard notification banner, iOS 26.2 simulator,
   *   the two timeout retracts of `exitMs`, fitted on the bottom edge's
   *   progress per frame (rms 0.021 of the travel, worst 0.066), Oct 24 2026
   */
  exitCurve: [0.4, 0.1, 0.75, 0.9],
} as const;
