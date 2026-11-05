// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rubberBand.ts
 * @input An overflow past an edge, the scroll view's dimension and UIKit's
 *   rubber-band coefficient
 * @output Exports `rubberBand` (finger overflow → displayed overflow), its
 *   inverse, its slope, and the clamp/unclamp pair over a [min, max] range
 * @position Pure math; no DOM, no React
 *
 * UIScrollView resists a drag past its content edge with
 *   b = (1 − 1 ÷ (x·c ÷ d + 1))·d
 * where x is how far the finger has gone past the edge, d the scroll view's
 * size on that axis and c = 0.55 (uikit/scroll.ts records the sources). The
 * displayed overflow b approaches d but never reaches it, and its slope at
 * the edge is c: the first points of overflow move at 55 % of the finger.
 *
 * The inverse matters for spec:AST-094 FR6 (a finger catches any animation
 * mid-flight): a finger that lands on content still bouncing back has to
 * resume the drag from the finger position that would produce the overflow
 * on screen, or the content jumps.
 *
 * SYNC: When modified, update:
 * - /packages/core/src/motion/rubberBand.test.ts
 * - /packages/core/src/motion/README.md
 */

import {scroll} from './uikit/scroll';

/**
 * Displayed overflow for a finger `overflow` past the edge (signed: the sign
 * is kept). `dimension` is the scroll view's size on the axis.
 */
export function rubberBand(
  overflow: number,
  dimension: number,
  coefficient: number = scroll.rubberBand.coefficient,
): number {
  if (!(dimension > 0)) {
    return 0;
  }
  const x = Math.abs(overflow);
  const banded = (1 - 1 / ((x * coefficient) / dimension + 1)) * dimension;
  return overflow < 0 ? -banded : banded;
}

/** The finger overflow that displays `displayed`; ±Infinity at ±dimension. */
export function rubberBandInverse(
  displayed: number,
  dimension: number,
  coefficient: number = scroll.rubberBand.coefficient,
): number {
  if (!(dimension > 0)) {
    return 0;
  }
  const b = Math.abs(displayed);
  if (b >= dimension) {
    return displayed < 0 ? -Infinity : Infinity;
  }
  const x = ((dimension / coefficient) * b) / (dimension - b);
  return displayed < 0 ? -x : x;
}

/**
 * d(displayed) ÷ d(finger) at a finger overflow: what a finger velocity
 * becomes on screen while banding (c at the edge, falling toward 0).
 */
export function rubberBandSlope(
  overflow: number,
  dimension: number,
  coefficient: number = scroll.rubberBand.coefficient,
): number {
  if (!(dimension > 0)) {
    return 0;
  }
  const u = (Math.abs(overflow) * coefficient) / dimension + 1;
  return coefficient / (u * u);
}

/**
 * The displayed value for a raw (finger-driven) `value` constrained to
 * [min, max]: unchanged inside, rubber-banded past either edge.
 */
export function rubberBandClamp(
  value: number,
  min: number,
  max: number,
  dimension: number,
  coefficient: number = scroll.rubberBand.coefficient,
): number {
  if (value < min) {
    return min + rubberBand(value - min, dimension, coefficient);
  }
  if (value > max) {
    return max + rubberBand(value - max, dimension, coefficient);
  }
  return value;
}

/** Inverse of `rubberBandClamp`: the raw value that displays `displayed`. */
export function rubberBandUnclamp(
  displayed: number,
  min: number,
  max: number,
  dimension: number,
  coefficient: number = scroll.rubberBand.coefficient,
): number {
  if (displayed < min) {
    return min + rubberBandInverse(displayed - min, dimension, coefficient);
  }
  if (displayed > max) {
    return max + rubberBandInverse(displayed - max, dimension, coefficient);
  }
  return displayed;
}
