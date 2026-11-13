// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemLeadingContext.tsx
 * @input Uses createSharedContext
 * @output Exports ItemLeadingContext
 * @position Internal seam between Item and a row component that adds one
 *   control before Item's slots
 *
 * A List row's reorder handle is the one element reordering adds to a row.
 * Putting the handle in `startContent` would wrap it in a start-slot element
 * of its own, a second element. So the row passes the handle here instead,
 * and Item renders it before its slots, unwrapped. Item resets the context
 * for what it renders, so a nested Item never renders its parent's control.
 *
 * `null` when the row adds nothing.
 */

import type {ReactNode} from 'react';
import {createSharedContext} from '../utils/sharedContext';

export const ItemLeadingContext = createSharedContext<ReactNode>(
  'ItemLeadingContext',
  1,
  null,
);
ItemLeadingContext.displayName = 'ItemLeadingContext';
