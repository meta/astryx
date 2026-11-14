// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemEdgeControlContext.tsx
 * @input Uses createSharedContext
 * @output Exports ItemEdgeControlContext and its ItemEdgeControl value type
 * @position Internal seam between Item and a row component that adds one
 *   control before or after Item's slots
 *
 * A List row's reorder handle is the one element reordering adds to a row.
 * A start or end slot would wrap the handle in an element of its own, a
 * second element. So the row passes the handle here, with the edge it sits
 * at, and Item renders it before or after its slots, unwrapped. One context
 * serves both edges, so each row adds one provider and a deeply nested list
 * keeps its render depth. Item resets it for what it renders, so a nested
 * Item never renders its parent's control.
 *
 * `null` when the row adds nothing.
 */

import type {ReactNode} from 'react';
import {createSharedContext} from '../utils/sharedContext';

/** A control a row adds at one edge of Item's slots. */
export type ItemEdgeControl = Readonly<{
  control: ReactNode;
  edge: 'start' | 'end';
}>;

export const ItemEdgeControlContext =
  createSharedContext<ItemEdgeControl | null>(
    'ItemEdgeControlContext',
    1,
    null,
  );
ItemEdgeControlContext.displayName = 'ItemEdgeControlContext';
