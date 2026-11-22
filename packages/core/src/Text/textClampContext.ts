// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file textClampContext.ts
 * @input Uses createLayerScopedContext
 * @output TextClampContext: true inside a Text that clamps its lines;
 *   TextMeasureOnInterestContext: true where a Text measures truncation on
 *   its first hover, tap or focus instead of when it mounts
 * @position Internal; Text provides TextClampContext and Link reads it;
 *   Table's default cells provide TextMeasureOnInterestContext and Text reads
 *   it
 *
 * A layer boundary resets both to false. Content in a layer is not inside
 * the clamped text or the cell.
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

export const TextClampContext = createLayerScopedContext(
  'TextClampContext',
  1,
  false,
);

export const TextMeasureOnInterestContext = createLayerScopedContext(
  'TextMeasureOnInterestContext',
  1,
  false,
);
