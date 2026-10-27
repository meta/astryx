// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file ItemTrailingContext.tsx
 * @input Uses React createContext
 * @output Exports ItemTrailingContext
 * @position Internal seam between Item and a row component that adds one
 *   control after Item's slots
 *
 * A List row's reorder handle is the one element reordering adds to a row
 * (spec:AST-103 FR5). With end content, the handle joins Item's end slot;
 * without it, putting the handle in `endContent` would wrap it in an end-slot
 * element of its own, a second element. Such a row passes the handle here
 * instead, and Item renders it after its slots, unwrapped. Item resets the
 * context for what it renders, so a nested Item never renders its parent's
 * control.
 *
 * `null` when the row adds nothing.
 */

import {createContext, type ReactNode} from 'react';

export const ItemTrailingContext = createContext<ReactNode>(null);
ItemTrailingContext.displayName = 'ItemTrailingContext';
