// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file indicatorPress.stylex.ts
 * @input Uses StyleX
 * @output Exports `indicatorPressScope`, the marker of a first-party
 *   indicator that paints its own press
 * @position Internal entry for Astryx's own replacement indicators;
 *   CheckboxInput reads it
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Marks a first-party replacement indicator that paints its own press, for
 * a shape that CheckboxInput's rounded-square press layer would tint past,
 * such as a circle. CheckboxInput leaves that layer off over an indicator
 * with this marker.
 *
 * @internal Not public API: the touch press reaches the indicator through a
 * private property.
 */
export const indicatorPressScope: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
