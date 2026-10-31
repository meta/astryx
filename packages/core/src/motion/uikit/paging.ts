// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paging.ts
 * @input Nothing; data only
 * @output Exports `paging`, the constants of a paging UIScrollView
 *   (`isPagingEnabled`, and the scroll view inside UIPageViewController): the
 *   integrator that carries a release onto its page, the rule that picks the
 *   page, the catch, and `setContentOffset(_:animated:)`
 * @position The paging domain of the UIKit constants table (motion/uikit);
 *   read inside core only (motion/paging.ts and the pager), so the `uikit`
 *   namespace does not re-export it
 *
 * One model drives every motion of a paging scroll view after the finger
 * lifts: the settle onto the chosen page AND the return from a rubber-banded
 * overscroll at the first or last page. Per display frame UIKit runs
 * floor(frame interval in ms) steps of one millisecond each:
 *
 *   v = (v + (target − x) · springPull) · friction;  x += v   (v in pt per step)
 *
 * so a 60 Hz frame advances 16 steps, not 16.67. Replayed with the printed
 * values below at the recorded frame times, this reproduces the captured
 * contentOffset of eight releases at rest to 0.20 pt RMS, five overscroll
 * returns to 0.16–0.33 pt RMS (402 pt pages, iOS 26.2, 3× screen). Dropping
 * the floor (16.67 steps per frame) misses by 1.0 pt RMS with a systematic
 * shape, which is how the stepping was identified.
 *
 * Every leaf carries one or more `@source` (apple-docs | wwdc | webkit |
 * measured | GUESS); webkit and GUESS values also carry the `@measure` task
 * that will confirm or replace them (motion/MEASUREMENTS.md). uikit.test.ts
 * enforces both.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/MEASUREMENTS.md (measurement tasks)
 * - /packages/core/src/motion/paging.ts and paging.test.ts
 */

export const paging = {
  integrator: {
    /**
     * Velocity added per one-millisecond step, per point of distance to the
     * target page (pt/step², the step being one integration step).
     * @source measured: UIKit lab, iOS 26.2 simulator, `_pagingSpringPull`
     *   read on a 402 pt paging UIScrollView and on UIPageViewController's
     *   scroll view (same value), replayed against 8 captured settles to
     *   0.20 pt RMS (2026-10-23)
     */
    springPull: 0.000284858,
    /**
     * Velocity kept per step after the pull (`_pagingFriction`, equal to
     * `_defaultPagingFriction`).
     * @source measured: UIKit lab, iOS 26.2 simulator, `_pagingFriction` and
     *   `_defaultPagingFriction` read on the same two scroll views, replayed
     *   with springPull (2026-10-23)
     */
    friction: 0.970815,
    /**
     * Integration steps per second of real time: floor(16.67 ms) = 16 steps
     * per 60 Hz frame (and floor(8.33 ms) = 8 per 120 Hz frame), so 960.
     * @source measured: UIKit lab, iOS 26.2 simulator, 60 fps per-frame
     *   contentOffset log of 8 releases at rest: per-frame floor stepping fits
     *   to 0.20 pt RMS, unfloored stepping to 1.0 pt RMS (2026-10-23)
     */
    stepsPerSecond: 960,
    /**
     * A settle ends, on the page exactly, once the remaining distance is
     * below this many points and the step velocity below `restSpeed`.
     * @source measured: UIKit lab, iOS 26.2 simulator, the captured settles
     *   jump the last 0.33 pt onto the page about 0.35 s after a release at
     *   rest (2026-10-23)
     */
    restDistance: 0.5,
    /**
     * Step velocity (pt per step) below which a settle may end.
     * @source GUESS — the captured settles end at about 0.04 pt per step;
     *   the threshold is not observable more finely at 60 fps
     * @measure M-PG12
     */
    restSpeed: 0.05,
  },
  release: {
    /**
     * Released slower than `advanceSpeed`, the scroll view settles on the
     * page nearest the content position: past half a page, the next one.
     * The pager's release rule keeps the start page instead for a release moving back
     * toward it (`spec:AST-094` FR37).
     * @source measured: UIKit lab, iOS 26.2 simulator, releases at rest from
     *   page 1: content at 48.5 % of the page stays, 57.5 % goes to the next
     *   page; 45 % stays and 55 % advances on a second 402 pt pager
     *   (2026-10-23)
     */
    commitFraction: 0.5,
    /**
     * Released at least this fast (pt/s), the scroll view pages in the
     * direction of the velocity from wherever the content is: a flick from
     * 6 % of the page advances. The speed is UIPanGestureRecognizer's
     * velocity at the last movement (the scroll view's `_horizontalVelocity`
     * equals it at every sample), which never decays: a drag held still for
     * 397 ms before the lift still pages with the speed it had.
     * @source measured: UIKit lab, iOS 26.2 simulator, steady releases at
     *   10, 25 and 40 % of a 402 pt page: 292.7, 295.3 and 298.6 pt/s stay,
     *   310.7, 316.4 and 329.9 advance, at every position (a threshold, not
     *   a projection) (2026-10-23)
     */
    advanceSpeed: 300,
    /**
     * A settle velocity slower than this (pt/s) is zeroed: the settle starts
     * at rest. Paging tuning on top of the one release velocity every
     * gesture reads (spec:AST-100 FR3).
     * @source GUESS — the middle of the measured (200, 249] bracket: in the
     *   UIKit lab (iOS 26.2 simulator, 2026-10-23) the
     *   `scrollViewWillEndDragging` velocity reads 0 for steady releases at
     *   175 and 200 pt/s and keeps 0.249 pt/ms
     * @measure M-PG13
     */
    velocityFloor: 225,
    /**
     * Pages a release may travel from the page the drag started on, at any
     * speed and however far the finger dragged.
     * @source measured: UIKit lab, iOS 26.2 simulator, a drag of 1.5 pages
     *   from page 1 lands on page 2 when released at 0, 600 and 3000 pt/s
     *   (2026-10-23)
     */
    maxPagesFromStart: 1,
  },
  /**
   * A finger landing on a settling pager does not stop it at once: the
   * settle runs on for about this long, then the content holds under the
   * finger. Lifted without moving, it settles again on the nearest page.
   * @source measured: UIKit lab, iOS 26.2 simulator, touch-downs 60 and
   *   160 ms into a settle: the content kept moving for 82.6 and 87.5 ms
   *   (5 frames), then held (2026-10-23)
   */
  catchStopMs: 85,
  /**
   * A horizontal pager's pan begins only when the drag runs within
   * atan(1 ÷ this) of horizontal (26.6° for 2); a steeper drag is left to
   * the vertical scroll around it, and between 26.6° and 45° neither moves.
   * @source measured: UIKit lab, iOS 26.2 simulator, a scroll view's
   *   directional lock holds the major axis up to 25° and frees it from 30°;
   *   an inline calendar pager in a sheet pages at 20° from horizontal,
   *   moves neither itself nor the sheet at 35° and 45°, and leaves 55° to
   *   the sheet (2026-10-23)
   */
  panAxisRatio: 2,
  animatedScroll: {
    /**
     * `setContentOffset(_:animated:)` duration, the same for one page and
     * for five (the motion a page control's tap starts).
     * @source measured: UIKit lab, iOS 26.2 simulator,
     *   `_contentOffsetAnimationDuration` read as 0.3, and five animated
     *   moves of 1 to 5 pages lasting 0.30 s each (2026-10-23)
     */
    duration: 0.3,
    /**
     * Its curve: sinusoidal ease-in-out, x = from + (to − from) · (1 − cos πu) ÷ 2
     * for u = t ÷ duration.
     * @source measured: UIKit lab, iOS 26.2 simulator, the five moves fit
     *   the sinusoid to 0.14–0.51 pt RMS (a 2010 pt move to 0.20 pt);
     *   easeInEaseOut (0.42, 0, 0.58, 1) misses by 7.7 pt (2026-10-23)
     */
    curve: 'sineInOut',
  },
  /**
   * Past the first or last page the content follows the finger through the
   * scroll view's rubber band (scroll.rubberBand.coefficient) with d = the
   * page width, and returns on the integrator above.
   * @source measured: UIKit lab, iOS 26.2 simulator, 90 pt of pan past
   *   page 0 shows 42.7–45 pt, 290 pt shows 114.3 pt (the formula gives
   *   44.1 and 114.2 with c 0.55 and d 402); the return replays on the
   *   integrator to 0.16–0.33 pt RMS (2026-10-23)
   */
  rubberBandDimension: 'pageWidth',
} as const;
