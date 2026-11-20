// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reorder.ts
 * @input `scroll` (the content-touch delay) and `UIKIT_GESTURES` (the pan
 *   hysteresis)
 * @output Exports `reorder`: the values of a UIKit table's edit-mode reorder
 *   that a reorder plays. They are the reorder control's claim and the edge
 *   autoscroll. Neither is a spring or a curve. The rows' glides play the
 *   shared settle role (`springs.settle`)
 * @position The reorder domain of the UIKit constants table (motion/uikit).
 *   Read by List/reorderModel.ts, List/listReorderEngine.tsx and
 *   List/ListReorderTouch.ts
 *
 * Measured on a `UITableView` in editing mode with reorder controls only, in
 * an instrumented UIKit app on the iOS 26.2 simulator. The table had 40 rows
 * of 44 pt, with two of 88 pt in the second run. Every animation, offset and
 * recognizer state was logged per frame while real HID touches dragged the
 * reorder control. Some findings need no value below. There is no lift: a
 * held or dragged row changes neither scale, opacity, z position nor shadow.
 * The dragged row follows the finger one to one with the grab offset kept.
 * The drop goes to the current drop position with no velocity projection,
 * and no haptic plays. UIKit's rows also slide out of the way during a drag,
 * on springDuration 0.3 s with bounce 0. That is 0.03 s shorter per point of
 * autoscroll step. Its drop springs from rest on a springDuration of 0.3 s
 * times min(1, the distance left / half the row's height). Astryx's reorder
 * departs from both by its design record. The rows stay still behind an
 * insertion cue until the drop, and every glide plays the shared settle
 * role. So neither is a value here.
 *
 * Every leaf carries one or more `@source` (apple-docs | wwdc | webkit |
 * measured | GUESS). GUESS values also carry the `@measure` task that will
 * confirm or replace them (MEASUREMENTS.md, M-RO rows). uikit.test.ts
 * enforces both. Durations are in ms. Lengths are in points, one CSS px
 * each.
 *
 * Plain data, with no side effect on import.
 *
 * SYNC: When modified, update /packages/core/src/motion/MEASUREMENTS.md.
 */

import {UIKIT_GESTURES} from './gestures';
import {scroll} from './scroll';

export const reorder = {
  claim: {
    /**
     * A still touch on the reorder control claims the drag after the scroll
     * view's content-touch delay. Once it has passed, the table stops
     * scrolling: `isScrollEnabled` turns false.
     * @source measured: UIKit lab, iOS 26.2 sim iPhone 17 Pro, table reorder
     *   (isScrollEnabled false 148–149 ms after touch-down on the reorder
     *   control), Oct 23 2026
     */
    delayMs: scroll.delaysContentTouchesMs,
    /**
     * Travel before the claim that hands the touch to the scroll view. A flick
     * that starts on the reorder control scrolls the table with momentum, and
     * the row does not move. The scroll view's pan begins at its hysteresis.
     * @source measured: UIKit lab, iOS 26.2 sim iPhone 17 Pro, table reorder
     *   (a 120 pt flick in 80 ms from the reorder control scrolled the table.
     *   The row stayed), Oct 23 2026
     */
    allowableMovement: UIKIT_GESTURES.pan.hysteresis.value,
  },
  autoscroll: {
    /**
     * Autoscroll is a timer: the offset moves by a whole number of points
     * every 20 ms (50 Hz), constant at a given depth.
     * @source measured: UIKit lab, iOS 26.2 sim iPhone 17 Pro, table reorder
     *   autoscroll (contentOffset per tick), Oct 23 2026
     */
    tickMs: 20,
    /**
     * The depths of the samples: how far the dragged row's edge (not the
     * finger) is past the scroll view's edge, negative inside. Between
     * samples the step is interpolated and rounded to a whole point. Deeper
     * than the last sample it stays at the last (the row is clamped with its
     * centre on the edge there).
     * @source measured: UIKit lab, iOS 26.2 sim iPhone 17 Pro, table reorder
     *   autoscroll with 44 pt rows (bottom edge. The top edge agreed within a
     *   point: 2 at 4 inside, 9 at 20 beyond), Oct 23 2026
     */
    depths: [-3, 6, 8, 10, 12, 16, 20, 22],
    /**
     * Points per tick at each of `depths`: 100 pt/s at the start, 500 pt/s at
     * the deepest.
     * @source measured: UIKit lab, iOS 26.2 sim iPhone 17 Pro, table reorder
     *   autoscroll with 44 pt rows, Oct 23 2026
     */
    stepsPt: [2, 2, 3, 3, 4, 6, 8, 10],
    /**
     * How far inside the edge autoscroll starts, at the first sample's step.
     * There is none with the row's edge 12 pt inside, and 2 pt per tick at
     * 3 pt inside.
     * @source GUESS — a point inside the measured bracket (12 to 3 pt)
     * @measure M-RO26
     */
    startInset: 8,
  },
} as const;
