// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemListRowContext.tsx
 * @input Uses createSharedContext
 * @output Exports ItemListRowContext
 * @position Internal seam between ListItem and the Item it renders. Under a
 *   coarse primary pointer a List row's whole touch target follows its link,
 *   so ListItem marks its Item as a List row. Item clears the mark for its own
 *   content, and a standalone Item has none.
 */

import {createSharedContext} from '../utils/sharedContext';

export const ItemListRowContext = createSharedContext(
  'ItemListRowContext',
  1,
  false,
);
ItemListRowContext.displayName = 'ItemListRowContext';
