// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file index.ts
 * @input BottomSheet.tsx, BottomSheetSwitcher.tsx
 * @output Re-exports the BottomSheet public API
 * @position Component entry point; re-exported by /packages/core/src/index.ts
 */

export {BottomSheet} from './BottomSheet';
export type {
  BottomSheetHeight,
  BottomSheetProps,
  BottomSheetSnapPoint,
} from './BottomSheet';
export {BottomSheetSwitcher} from './BottomSheetSwitcher';
export type {BottomSheetSwitcherProps} from './BottomSheetSwitcher';
