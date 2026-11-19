// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file refreshValues.ts
 * @input Nothing; data only
 * @output Exports `refreshControl`, UIRefreshControl's pull values: the
 *   refreshing inset, the trigger, the pull after it, the reveal, the end, and
 *   the end's duration token
 * @position Internal to the refresh pull. A release onto the inset uses Core's
 *   `scroll.bounce`, and a pull past `height` uses Core's rubber band.
 */

// Lengths are in pt (CSS px), durations in ms, and curves are cubic-bézier
// control points.
export const refreshControl = {
  /**
   * The refreshing inset: while refreshing, the content rests this far below
   * the top of the scroll view, with the indicator in the gap. Also the
   * stretch of a pull that tracks the finger one to one before the rubber
   * band starts.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIRefreshControl on a 334 pt scroll view: content held
   *   at −60.33 while refreshing (inset top 60), offset equal to finger
   *   travel − 10 pt up to 60, Oct 23 2026
   */
  height: 60,
  /**
   * The trigger distance as a fraction of the scroll view's height. A pull
   * triggers when its overscroll reaches this × the height, or
   * `triggerMinimum` if that is larger. The indicator is then fully revealed.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIRefreshControl on scroll views 400 pt (trigger at
   *   79.0–79.3), 874 pt (168.3–173.7) and 1366 pt (about 271, from the
   *   reveal's slope) tall, Oct 23 2026
   */
  triggerHeightFraction: 0.198,
  /**
   * The shortest trigger distance, pt of overscroll: short scroll views
   * trigger here.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIRefreshControl on a 334 pt scroll view: trigger at
   *   73.0–73.3 at the top of the screen and 540 pt down, Oct 23 2026
   */
  triggerMinimum: 73,
  /**
   * After the trigger, the offset follows the finger one to one again, up to
   * this many `height`s of overscroll. Past it, the pull resists again.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, UIRefreshControl on a 334 pt scroll view, setContentOffset
   *   log: one to one from the frame after the trigger to −117.67, Oct 23 2026
   */
  postTriggerLinearHeights: 2,
  /**
   * The indicator's reveal curve: the reveal goes from 0 to 1 on it as the
   * overscroll goes from 0 to the trigger distance.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, CAAnimation dump (CABasicAnimation on the indicator's
   *   opacity, 1 s, timing function (0.42, 0, 0.58, 1)) and per-frame reads
   *   of its speed, timeOffset and opacity, Oct 23 2026
   */
  revealCurve: [0.42, 0, 0.58, 1],
  /**
   * `endRefreshing()` while the control is visible: the inset leaves (the
   * content moves up by `height`) over this long. UIView.animate plays it on
   * its default curve, easeInEaseOut, which has the control points of
   * `revealCurve`. The end plays that curve over the theme duration token
   * nearest this value (`endDurationToken`). This value stays as the
   * reference for that choice.
   * @source measured: UIKit lab (injected host app), iOS 26.2 simulator,
   *   iPhone 17 Pro, setContentOffset per frame over 0.3 s inside
   *   UIView.animate(withDuration: 0.3), three runs at rest identical to the
   *   frame, Oct 23 2026
   * @source apple-docs https://developer.apple.com/documentation/quartzcore/camediatimingfunctionname/easeineaseout
   */
  endMs: 300,
  /**
   * The theme duration token that the end plays. In the neutral theme its
   * value is the one nearest `endMs`: 300 ms. The theme's tempo scales it.
   */
  endDurationToken: '--duration-medium',
} as const;
