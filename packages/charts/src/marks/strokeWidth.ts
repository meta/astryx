// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file strokeWidth.ts
 * @input A mark's optional strokeWidth option
 * @output The stroke width a line or area mark draws
 * @position Shared stroke-width rule for the charts mark builders
 */

/** Default stroke width in CSS pixels. */
export const DEFAULT_STROKE_WIDTH = 2;

/**
 * Line and area marks share this rule: a finite option clamps at zero (0
 * draws nothing, negatives cannot invert), anything else falls back to 2.
 */
export function resolveStrokeWidth(strokeWidth: number | undefined): number {
  return typeof strokeWidth === 'number' && Number.isFinite(strokeWidth)
    ? Math.max(0, strokeWidth)
    : DEFAULT_STROKE_WIDTH;
}
