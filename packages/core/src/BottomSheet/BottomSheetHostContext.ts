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
 */

// A sheet rendered in another sheet's content is presented only while its
// host is open. Without this, a host that closes from code would leave the
// inner dialog open in the top layer with no box: an invisible modal that
// blocks the page. The host never writes the inner sheet's state. At the
// root the context is null, which reads as open.

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
