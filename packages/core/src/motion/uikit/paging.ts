// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file paging.ts
 * @input Nothing; data only
 * @output Exports `paging`, the measured constants of a paging UIScrollView,
 *   and `registerPagingTable`, which registers them with the motion registry
 * @position The paging domain of the UIKit constants table (motion/uikit). Only
 *   core reads it, so the `uikit` namespace does not re-export it
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/MEASUREMENTS.md (measurement tasks)
 * - /packages/core/src/motion/paging.ts and paging.test.ts
 */

import {registerMotionTable} from '../roles';

export const paging = {
  /**
   * After the lift, one model moves the content: the settle onto the chosen
   * page and the return from an overscroll. Each display frame runs floor(frame
   * interval in ms) steps of 1 ms:
   *
   *   v = (v + (target − x) · springPull) · friction;  x += v  (v: pt per step)
   *
   * A 60 Hz frame runs 16 steps, not 16.67. With these values, the model
   * replays eight captured releases to 0.20 pt RMS. It replays five overscroll
   * returns to 0.16–0.33 pt RMS (402 pt pages, iOS 26.2, 3× screen). Without
   * the floor, the error is 1.0 pt RMS, with a systematic shape.
   */
  integrator: {
    /**
     * Velocity added per 1 ms step, per point of distance to the target page
     * (pt per step²).
     * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026.
     *   `_pagingSpringPull` reads the same on a 402 pt paging UIScrollView and
     *   on UIPageViewController's scroll view. It replays 8 captured settles to
     *   0.20 pt RMS.
     */
    springPull: 0.000284858,
    /**
     * Velocity kept per step after the pull (`_pagingFriction`, equal to
     * `_defaultPagingFriction`).
     * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026. Both read
     *   the same on the two scroll views of `springPull`, and they replay with
     *   it.
     */
    friction: 0.970815,
    /**
     * Integration steps per second: floor(16.67 ms) = 16 steps per 60 Hz frame,
     * and floor(8.33 ms) = 8 per 120 Hz frame, so 960.
     * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026. In a 60 fps
     *   log of 8 releases at rest, floored stepping fits to 0.20 pt RMS.
     *   Unfloored stepping fits to 1.0 pt RMS.
     */
    stepsPerSecond: 960,
    /**
     * A settle ends exactly on the page once the remaining distance is below
     * this many points and the step velocity is below `restSpeed`.
     * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026. The
     *   captured settles jump the last 0.33 pt onto the page about 0.35 s after
     *   a release at rest.
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
     * Released slower than `advanceSpeed`, the scroll view settles on the page
     * nearest the content position: past half a page, the next one. The pager
     * keeps the start page instead for a release that moves back toward it.
     * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026. In releases
     *   at rest from page 1, content at 48.5 % of the page stays, and 57.5 %
     *   goes to the next page. On a second 402 pt pager, 45 % stays and 55 %
     *   advances.
     */
    commitFraction: 0.5,
    /**
     * Released at least this fast (pt/s), the scroll view pages in the
     * direction of the velocity, from any content position. A flick from 6 % of
     * the page advances. The speed is UIPanGestureRecognizer's velocity at the
     * last movement, and it never decays. The scroll view's
     * `_horizontalVelocity` equals it at every sample. A drag held still for
     * 397 ms before the lift still pages at the speed it had.
     * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026. Steady
     *   releases at 10, 25 and 40 % of a 402 pt page: 292.7, 295.3 and 298.6
     *   pt/s stay; 310.7, 316.4 and 329.9 advance. The result is the same at
     *   every position: a threshold, not a projection.
     */
    advanceSpeed: 300,
    /**
     * A settle velocity slower than this (pt/s) is zeroed, so the settle starts
     * at rest. It is paging's own tuning on the one release velocity that every
     * gesture reads.
     * @source GUESS — the middle of the measured (200, 249] bracket. In the
     *   UIKit lab (iOS 26.2 simulator, Oct 23 2026),
     *   `scrollViewWillEndDragging` reads 0 for steady releases at 175 and 200
     *   pt/s. It reads 0.249 pt/ms for a release at 249 pt/s.
     * @measure M-PG13
     */
    velocityFloor: 225,
    /**
     * Pages a release may travel from the page the drag started on, at any
     * speed and drag distance.
     * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026. A drag of
     *   1.5 pages from page 1 lands on page 2 at release speeds of 0, 600 and
     *   3000 pt/s.
     */
    maxPagesFromStart: 1,
  },
  /**
   * A finger that lands on a settling pager does not stop it at once. The
   * settle runs on for about this long, then the content holds under the
   * finger. Lifted without a move, the content settles again on the nearest
   * page.
   * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026. After
   *   touch-downs 60 and 160 ms into a settle, the content moved on for 82.6
   *   and 87.5 ms (5 frames), then held.
   */
  catchStopMs: 85,
  /**
   * In a sheet, a horizontal pager's pan begins only for a drag within atan(1 ÷
   * this) of horizontal (26.6° for 2). A steeper drag goes to the sheet.
   * Between 26.6° and 45°, neither moves.
   * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026. A scroll
   *   view's directional lock holds the major axis up to 25° and frees it from
   *   30°. An inline calendar pager in a sheet pages at 20° from horizontal. At
   *   35° and 45°, it moves neither itself nor the sheet, and it leaves 55° to
   *   the sheet.
   */
  panAxisRatio: 2,
  /**
   * Inside a vertical scroll view, exactly one of the pager and the scroll view
   * takes a drag, decided once by its dominant axis. The pager takes it when
   * |dx| ≥ this × |dy|, 45° and the tie included. The scroll view takes any
   * other drag.
   * @source measured: UIKit lab, iOS 26.2 simulator, Oct 24 2026. A 402 × 300
   *   paging view sits in a full-screen vertical scroll view, with 150 pt drags
   *   at 0–90°. The pager takes 0–45°, and the page takes 50–90°. At 35°, the
   *   outer view stays at 0 through 86 pt of vertical travel. The choice
   *   happens at 10–15 pt of travel.
   */
  nestedPanAxisRatio: 1,
  animatedScroll: {
    /**
     * `setContentOffset(_:animated:)` duration in milliseconds. It is the same
     * for one page and for five, as for a page control's tap.
     * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026.
     *   `_contentOffsetAnimationDuration` reads 0.3, and five animated moves of
     *   1 to 5 pages each last 0.30 s.
     */
    durationMs: 300,
    /**
     * Its curve is a sinusoidal ease-in-out: x = from + (to − from) · (1 − cos
     * πu) ÷ 2, for u = t ÷ duration. This cubic bézier matches it to 0.02 % of
     * the distance (0.09 pt over a 402 pt page).
     * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026. The five
     *   moves fit the sinusoid to 0.14–0.51 pt RMS, and a 2010 pt move fits to
     *   0.20 pt. The curve easeInEaseOut (0.42, 0, 0.58, 1) misses by 7.7 pt.
     */
    curve: [0.364212, 0, 0.635788, 1],
  },
  /**
   * Past the first or last page, the content follows the finger through the
   * scroll view's rubber band (scroll.rubberBand.coefficient), with d = the
   * page width. It returns on the integrator above.
   * @source measured: UIKit lab, iOS 26.2 simulator, Oct 23 2026. A pan of 90
   *   pt past page 0 shows 42.7–45 pt, and 290 pt shows 114.3 pt. The formula
   *   gives 44.1 and 114.2, with c 0.55 and d 402. The return replays on the
   *   integrator to 0.16–0.33 pt RMS.
   */
  rubberBandDimension: 'pageWidth',
} as const;

/**
 * Registers this table with the motion registry (motion/roles.ts). The pager
 * then reads `setContentOffset(_:animated:)`'s duration and curve through
 * `resolveMotion`, as it reads every touch motion. The table lists no role,
 * because no motion role names any of its values, so each plays as measured.
 * Nothing registers on import, and a second call does nothing.
 */
export function registerPagingTable(): void {
  registerMotionTable('paging', paging, {
    // Who gets the touch, not how anything moves.
    exclude: ['catchStopMs'],
  });
}
