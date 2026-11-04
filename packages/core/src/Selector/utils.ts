// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file utils.ts
 * @output Utility functions for Selector
 * @position Utilities; used by Selector.tsx
 */

import type {SelectorOptionType, SelectorOptionData} from './types';
import {getSelectableOptionEntries} from './selectableOptionEntries';

export {
  isOptionData,
  isDivider,
  isSection,
  normalizeOption,
} from './optionShape';

/**
 * Get all selectable options (flattening sections)
 */
export function getSelectableOptions(
  options: SelectorOptionType[],
): SelectorOptionData[] {
  return getSelectableOptionEntries(options).map(entry => entry.item);
}
