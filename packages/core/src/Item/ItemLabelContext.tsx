// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemLabelContext.tsx
 * @input Uses createSharedContext
 * @output Exports ItemLabelContext and ItemLabelNeededContext
 * @position Internal seam between Item and a control it renders in a slot
 *
 * Item renders the row's label and owns the element that holds it. A control
 * in a slot points at that element with `aria-labelledby`, so a label of any
 * shape names it. A List row's reorder handle is one: "Reorder" followed by
 * the row's label. Only Item knows the element's id. Publishing it here keeps
 * that wiring internal, as ItemDescriptionContext does for the description.
 *
 * `null` when the row renders no label, or when no control asks for it
 * (ItemLabelNeededContext): a row gives its label an id only when needed.
 */

import {createSharedContext} from '../utils/sharedContext';

export const ItemLabelContext = createSharedContext<string | null>(
  'ItemLabelContext',
  1,
  null,
);
ItemLabelContext.displayName = 'ItemLabelContext';

/**
 * Whether a control in the row is named after the row's label. Item gives its
 * label element an id, and publishes it, only then.
 */
export const ItemLabelNeededContext = createSharedContext(
  'ItemLabelNeededContext',
  1,
  false,
);
ItemLabelNeededContext.displayName = 'ItemLabelNeededContext';
