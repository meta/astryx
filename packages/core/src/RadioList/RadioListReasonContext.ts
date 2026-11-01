// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file RadioListReasonContext.ts
 * @input Uses createLayerScopedContext
 * @output Exports RadioListReasonContext (internal; not re-exported)
 * @position Internal to RadioList; read by RadioListItem
 *
 * The id of a RadioList's disabled-reason tooltip while the group is disabled
 * with a `disabledMessage`. The reason describes the radiogroup (FR1), and
 * each radio adds it to its own `aria-describedby` (FR5): a screen reader
 * announces a radio's description when the radio takes focus, which it does
 * not reliably do for a description on the radiogroup.
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

// Layer-scoped like RadioListContext: content in a layer opened from inside the
// group is not a radio of it.
export const RadioListReasonContext = createLayerScopedContext<
  string | undefined
>(undefined);
RadioListReasonContext.displayName = 'RadioListReasonContext';
