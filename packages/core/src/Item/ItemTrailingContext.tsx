// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemTrailingContext.tsx
 * @input Uses createSharedContext
 * @output Exports ItemTrailingContext and its ItemEdgeControl value type
 * @position Internal seam between Item and a row component that adds one
 *   control at an edge of Item's slots
 *
 * A List row's reorder handle is the one element reordering adds to a row.
 * A start or end slot would wrap the handle in an element of its own, a
 * second element. So the row passes the handle here, with the edge it sits
 * at, and Item renders it after its slots (`'end'`) or before them
 * (`'start'`), unwrapped. Item resets the context for what it renders, so a
 * nested Item never renders its parent's control.
 *
 * `null` when the row adds nothing. Version 2: the value carries its edge,
 * so a Core copy that reads the version 1 value never gets this shape.
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
