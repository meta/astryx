// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file overflowLane.stylex.ts
 * @input Uses StyleX
 * @output Exports `overflowLaneMarker`, the marker of a flex lane that gives
 *   a single-row OverflowList its inline size
 * @position Internal entry for lanes that host a folding list; Toolbar marks
 *   its filling start lane, OverflowList reads it
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Marks a flex lane whose width the row gives, not its content: a lane that
 * grows into the leftover row width beside a lane that keeps its own. A
 * single-row OverflowList under this marker isolates its intrinsic inline
 * size and publishes its collapsed minimum, so the lane shrinks to that
 * minimum and the row wraps, instead of flooring at the unfolded items.
 * Lists outside such a lane keep their content-sized intrinsic width.
 *
 * @internal Not public API: the lane and the list share private CSS
 * variables for the published bounds.
 */
export const overflowLaneMarker: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
