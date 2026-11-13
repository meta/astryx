// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemTrailingContext.tsx
 * @input Uses createSharedContext
 * @output Exports ItemTrailingContext
 * @position Internal seam between Item and a row component that adds one
 *   control after Item's slots
 *
 * The end-edge twin of ItemLeadingContext: a List row's reorder handle, when
 * its reorderable places handles at the end. Item renders it after its slots,
 * unwrapped, so it stays the one element reordering adds to the row. Item
 * resets the context for what it renders, so a nested Item never renders its
 * parent's control.
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
