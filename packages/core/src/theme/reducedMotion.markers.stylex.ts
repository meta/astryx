// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file reducedMotion.markers.stylex.ts
 * @input StyleX
 * @output reducedMotionScope, the marker of a theme's `reducedMotion: 'always'`
 * @position Theme; the marked Theme wrapper and, for the root theme, `<html>`
 *   carry it beside `data-astryx-reduced-motion`
 */

import * as stylex from '@stylexjs/stylex';

/**
 * The marker of a theme's `reducedMotion: 'always'` mark. A Reduce Motion
 * style keys its twin on the mark as
 * `stylex.when.ancestor('[data-astryx-reduced-motion]', reducedMotionScope)`,
 * which matches under the marked Theme wrapper and, for the root theme, in
 * layers portaled to `<body>`, since `<html>` carries both. A marker of its
 * own: the default marker would also match every default-marker `:hover` rule
 * under a theme.
 */
export const reducedMotionScope: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
