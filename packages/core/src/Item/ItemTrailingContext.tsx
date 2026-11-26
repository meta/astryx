// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemTrailingContext.tsx
 * @input Uses createSharedContext
 * @output Exports ItemTrailingContext and its value type, ItemEdgeControl
 * @position Internal seam between Item and a row component that adds one
 *   control at an edge of Item's slots
 *
 * A List row's reorder handle is the one element reordering adds to a row.
 * At the row's end, with end content, the handle joins Item's end slot.
 * Elsewhere a slot of its own would wrap it in a second element. So the row
 * passes the handle here, with the edge it sits at. Item renders it before
 * its slots or after them, unwrapped. Item resets the context for what it
 * renders, so a nested Item never renders its parent's control.
 *
 * `null` when the row adds nothing. The value's shape is version 2: two
 * copies of Core on one page never read each other's earlier shape.
 */

import type {ReactNode} from 'react';
import {createSharedContext} from '../utils/sharedContext';

/** A control a row adds at one edge of Item's slots. */
export type ItemEdgeControl = Readonly<{
  control: ReactNode;
  edge: 'start' | 'end';
}>;

export const ItemTrailingContext = createSharedContext<ItemEdgeControl | null>(
  'ItemTrailingContext',
  2,
  null,
);
ItemTrailingContext.displayName = 'ItemTrailingContext';
