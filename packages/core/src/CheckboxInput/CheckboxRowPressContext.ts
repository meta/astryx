// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file CheckboxRowPressContext.ts
 * @input Uses the private layer-scoped context factory
 * @output Exports CheckboxRowPressContext: whether the row around a checkbox
 *   is the checkbox's press surface
 * @position Internal context; provided by CheckboxListItem around the row's
 *   own checkbox, read by CheckboxInput
 *
 * A row that answers a press anywhere on it (a CheckboxListItem whose surface
 * clicks are delegated to its checkbox) owns the touch press. The press is
 * the shared one (utils/pressFeedback.ts): the row carries the press marker
 * and the checkbox carries none, so the controller's innermost-wins rule finds
 * the row for a finger on the label, on the description, or on the box
 * itself, and the box's overlay paints the press paint its own row declares
 * (`--_checkbox-row-press-paint`, CheckboxListItem): set only while that row
 * is pressed under a coarse pointer.
 *
 * Layer-scoped, so content a layer portals out of the row (a popover opened
 * from the row's end content) starts from the default, and provided only
 * around the row's own checkbox, so another checkbox placed in the row's
 * content keeps its own press.
 *
 * SYNC: When modified, update CheckboxInput.tsx and
 * ../CheckboxList/CheckboxListItem.tsx.
 */

import {createLayerScopedContext} from '../Layer/layerScopedContext';

export const CheckboxRowPressContext = createLayerScopedContext(false);
CheckboxRowPressContext.displayName = 'CheckboxRowPressContext';
