// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file runningTextContext.ts
 * @input Uses createLayerScopedContext
 * @output RunningTextContext: true inside running text
 * @position Internal; Text and Markdown provide it and Link reads it
 *
 * A layer boundary resets it to false, because content in a layer is not
 * part of the text around its trigger.
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

export const RunningTextContext = createLayerScopedContext(
  'RunningTextContext',
  1,
  false,
);
