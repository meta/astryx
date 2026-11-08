// Copyright (c) Meta Platforms, Inc. and affiliates.

'use client';

/**
 * @file index.ts
 * @output Exports Selector and types
 * @position Public API entry point
 */

export {
  Selector,
  type SelectorProps,
  type SelectorPresentation,
  type SelectorSize,
  type SelectorStatus,
  type SelectorStatusType,
} from './Selector';
export {SelectorOption} from './SelectorOption';
export type {
  SelectorOptionType,
  SelectorOptionData,
  SelectorDivider,
  SelectorSection,
} from './types';
export {useCombobox, useSelectedItemOffset} from './hooks';
