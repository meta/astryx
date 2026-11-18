// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file textClampContext.ts
 * @input Uses createLayerScopedContext
 * @output TextClampContext: true inside a Text that clamps its lines
 * @position Internal; Text provides it and Link reads it
 *
 * A layer boundary resets it to false, because content in a layer is not
 * inside the clamped text box.
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

export const TextClampContext = createLayerScopedContext(
  'TextClampContext',
  1,
  false,
);
