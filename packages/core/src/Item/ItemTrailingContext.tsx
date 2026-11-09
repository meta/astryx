// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemTrailingContext.tsx
 * @input Uses createSharedContext
 * @output Exports ItemTrailingContext
 * @position Internal seam between Item and a row component that adds one
 *   control after Item's slots
 *
 * A List row's reorder handle is the one element reordering adds to a row.
 * With end content, the handle joins Item's end slot.
 * Without it, putting the handle in `endContent` would wrap it in an end-slot
 * element of its own, a second element. Such a row passes the handle here
 * instead, and Item renders it after its slots, unwrapped. Item resets the
 * context for what it renders, so a nested Item never renders its parent's
 * control.
 *
 * `null` when the row adds nothing.
 */

import type {ReactNode} from 'react';
import {createSharedContext} from '../utils/sharedContext';

export const ItemTrailingContext = createSharedContext<ReactNode>(
  'ItemTrailingContext',
  1,
  null,
);
ItemTrailingContext.displayName = 'ItemTrailingContext';
