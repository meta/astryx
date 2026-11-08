// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file utils.ts
 * @output Server-safe Resizable sizing helpers and public types
 * @position Subpath entry point: `@astryxdesign/core/Resizable/utils`
 */

import type {PixelWidth} from '../Table/utils';

export {pixel} from '../Table/utils';
export type {PixelWidth} from '../Table/utils';

/** A percentage with exactly one pixel floor or ceiling. */
export type ResizablePercentSize = {
  type: 'percent';
  value: number;
} & ({min: PixelWidth; max?: never} | {min?: never; max: PixelWidth});

/** A Resizable size: compatible atomic values or a structured size. */
export type ResizableSize =
  number | `${number}px` | `${number}%` | PixelWidth | ResizablePercentSize;

/**
 * Create a literal percentage with one pixel floor or ceiling.
 *
 * The options argument is required because an unbounded percentage already has
 * the canonical `'N%'` spelling. Use Table's `pixel()` helper for the bound.
 */
export function percent(
  value: number,
  options: {min: PixelWidth; max?: never} | {min?: never; max: PixelWidth},
): ResizablePercentSize {
  return {type: 'percent', value, ...options};
}
