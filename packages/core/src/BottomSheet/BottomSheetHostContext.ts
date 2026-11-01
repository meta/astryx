// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file BottomSheetHostContext.ts
 * @input React context
 * @output Exports BottomSheetHostContext and its value type
 * @position Internal to BottomSheet; how a sheet rendered inside another
 *   sheet's content learns whether that sheet is open
 *
 * SYNC: When modified, update:
 * - /packages/core/src/BottomSheet/BottomSheet.tsx
 * - /packages/core/src/BottomSheet/BottomSheetSwitcher.tsx
 * - /packages/core/src/BottomSheet/BottomSheetStacking.test.tsx
 *
 * A sheet rendered in another sheet's content is part of that sheet: it is
 * presented only while its host is open, leaves with it, and comes back with
 * it if its own `isOpen` is still true. Without this a host closing from code
 * would leave the inner dialog open in the top layer with no box to paint —
 * an invisible modal blocking the page. The inner sheet's state is never
 * written by the host: it stays the consumer's, as with a Dialog rendered in
 * a closed Dialog. The context is provided by every host (standalone, modal
 * or not, and each switcher step) and read by every standalone sheet and
 * every switcher flow; at the root it is null, which reads as "open".
 */

import {createContext} from 'react';

export interface BottomSheetHostContextValue {
  /** Whether the host sheet is open; a closing host reads false at once. */
  isOpen: boolean;
}

export const BottomSheetHostContext =
  createContext<BottomSheetHostContextValue | null>(null);
BottomSheetHostContext.displayName = 'BottomSheetHostContext';

export const OPEN_BOTTOM_SHEET_HOST: BottomSheetHostContextValue = {
  isOpen: true,
};
export const CLOSED_BOTTOM_SHEET_HOST: BottomSheetHostContextValue = {
  isOpen: false,
};
