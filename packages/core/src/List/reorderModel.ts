// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reorderModel.ts
 * @input A list's row geometry (layout tops and heights inside the list) and
 *   the reorder values of the UIKit constants table (motion/uikit/reorder.ts)
 * @output Pure functions of a reorder's drag: the slot a dragged row proposes
 *   (where the insertion cue goes), the movable range that a fixed row at
 *   either end of the list bounds, the autoscroll step and the tracking clamp
 * @position List internals for the List reorder (spec:AST-103), which drives
 *   a drag with them. No DOM, no React: unit tested against the UIKit lab
 *   measurements
 *
 * The rows stay still during a drag while an insertion cue marks the
 * proposed slot (design:ordered-collection-reordering DR3), so the model
 * proposes slots and moves no row. The slot rule: a row below the dragged row
 * changes places once the dragged row's centre passes that row's far edge less
 * the dragged row's height, and never before that row's near edge; a row
 * above mirrors it; boundaries sit in the middle of a gap, with no
 * hysteresis. Measured on UIKit (iOS 26.2): a 44 pt row moving down past 44
 * and 88 pt rows and back over them. GUESS, until M-RO27 measures them
 * (motion/MEASUREMENTS.md): a short row moving up past a taller row above
 * its place, and a tall row moving past a shorter one. Autoscroll moves a
 * whole number of points per tick, more the deeper the dragged row's edge is
 * past the scroll view's edge (measured).
 */

import {reorder} from '../motion/uikit/reorder';

/** One row: its layout top inside the list, its height, and whether it stays put. */
export interface ReorderRow {
  readonly top: number;
  readonly height: number;
  /**
   * A row with no handle, so no drag starts from it: a run of them at either
   * end of the list bounds a drag, and one in the middle is passed over
   * (spec:AST-103 FR1).
   */
  readonly isFixed: boolean;
}

export interface ReorderGeometry {
  readonly rows: ReadonlyArray<ReorderRow>;
  /** The space between two consecutive rows. */
  readonly gap: number;
}

/**
 * The slots `dragged` can take: all of them but those of the fixed rows that
 * end the list. A run of fixed rows at either end bounds the range; a fixed row
 * in the middle is passed over, as reorder mode's keys pass it
 * (spec:AST-103 FR1, FR4).
 */
export function movableRange(
  rows: ReadonlyArray<ReorderRow>,
  dragged: number,
): {start: number; end: number} {
  let start = 0;
  while (start < dragged && rows[start].isFixed) {
    start += 1;
  }
  let end = rows.length - 1;
  while (end > dragged && rows[end].isFixed) {
    end -= 1;
  }
  return {start, end};
}

/**
 * The slot the dragged row proposes for its centre, in list coordinates: where
 * the insertion cue goes. A row below it changes places once the centre passes
 * that row's far edge less the dragged row's height: for equal rows, the
 * neighbour's near edge, half a row, and for a 44 pt row passing an 88 pt row
 * below its place, that row's height (both measured). A row above mirrors it
 * (GUESS for unequal rows, M-RO27). Either way the centre must first pass the
 * neighbour's near edge, so a tall row never starts past a short neighbour
 * (its centre travels at least half its own height; GUESS, M-RO27).
 * Boundaries sit in the middle of a gap.
 */
export function proposedSlot(
  geometry: ReorderGeometry,
  dragged: number,
  center: number,
): number {
  const {rows, gap} = geometry;
  const height = rows[dragged].height;
  let slot = 0;
  for (let index = 0; index < rows.length; index += 1) {
    if (index === dragged) {
      continue;
    }
    const {top, height: rowHeight} = rows[index];
    const boundary =
      index < dragged
        ? Math.min(top + height, top + rowHeight) + gap / 2
        : Math.max(top + rowHeight - height, top) - gap / 2;
    if (boundary < center) {
      slot += 1;
    }
  }
  const {start, end} = movableRange(rows, dragged);
  return Math.min(end, Math.max(start, slot));
}

/**
 * Points per autoscroll tick with the dragged row's edge `depth` points past
 * the scroll edge (negative inside): none further inside than the start
 * inset, then UIKit's measured steps, interpolated and rounded.
 */
export function autoscrollStep(depth: number): number {
  const {depths, stepsPt, startInset} = reorder.autoscroll;
  if (depth < -startInset) {
    return 0;
  }
  if (depth <= depths[0]) {
    return stepsPt[0];
  }
  const last = depths.length - 1;
  if (depth >= depths[last]) {
    return stepsPt[last];
  }
  let index = 1;
  while (depths[index] < depth) {
    index += 1;
  }
  const d0 = depths[index - 1];
  const d1 = depths[index];
  const s0 = stepsPt[index - 1];
  const s1 = stepsPt[index];
  return Math.round(s0 + ((s1 - s0) * (depth - d0)) / (d1 - d0));
}

/** Where a dragged row may go: the scroller's visible edges and the list's ends. */
export interface ReorderBounds {
  /** The scroller's visible top and bottom. */
  readonly scrollTop: number;
  readonly scrollBottom: number;
  /** The list's first row top and last row bottom. */
  readonly listTop: number;
  readonly listBottom: number;
}

/**
 * The dragged row's top. At the scroller's visible edge the row stops with its
 * centre on the edge, as UIKit stops a row on the table's edge; at the list's
 * own end it stops with its edge there, so a row never hangs over the content
 * after an embedded list (a TransferList's next panel, a page footer).
 */
export function clampTop(
  top: number,
  height: number,
  bounds: ReorderBounds,
): number {
  const min = Math.max(bounds.scrollTop - height / 2, bounds.listTop);
  const max = Math.min(
    bounds.scrollBottom - height / 2,
    bounds.listBottom - height,
  );
  return Math.min(max, Math.max(min, top));
}
