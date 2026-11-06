// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CheckboxRowPressContext.ts
 * @input Uses the private layer-scoped context factory
 * @output CheckboxRowPressContext: whether the row is its checkbox's press surface
 * @position Internal; CheckboxListItem provides it, CheckboxInput reads it
 *
 * Such a row carries the shared press marker (utils/pressFeedback.ts). Its
 * checkbox carries none, so a finger anywhere on the row presses the row.
 * It is layer-scoped and wraps only the row's own checkbox.
 *
 * SYNC: When modified, update CheckboxInput.tsx and
 * ../CheckboxList/CheckboxListItem.tsx.
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

export const CheckboxRowPressContext = createLayerScopedContext(
  'CheckboxRowPressContext',
  1,
  false,
);
CheckboxRowPressContext.displayName = 'CheckboxRowPressContext';
