// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file utils.ts
 * @output Utility functions for Selector
 * @position Utilities; used by Selector.tsx
 */

import type {
  SelectorOptionType,
  SelectorOptionData,
  SelectorDivider,
  SelectorSection,
} from './types';

/**
 * Type guard: check if option is a selectable option (string or OptionData)
 */
export function isOptionData(
  option: SelectorOptionType,
): option is SelectorOptionData | string {
  if (typeof option === 'string') {
    return true;
  }
  return !('type' in option);
}

/**
 * Type guard: check if option is a divider
 */
export function isDivider(
  option: SelectorOptionType,
): option is SelectorDivider {
  return (
    typeof option === 'object' && 'type' in option && option.type === 'divider'
  );
}

/**
 * Type guard: check if option is a section
 */
export function isSection(
  option: SelectorOptionType,
): option is SelectorSection {
  return (
    typeof option === 'object' && 'type' in option && option.type === 'section'
  );
}

/**
 * Normalize string or option to consistent shape
 */
export function normalizeOption(
  option: string | SelectorOptionData,
): SelectorOptionData {
  if (typeof option === 'string') {
    return {value: option, label: option};
  }
  return {
    ...option,
    label: option.label ?? option.value,
  };
}

/** A selectable option as given, and its normalized data. */
export interface SelectableOptionEntry {
  readonly source: string | SelectorOptionData;
  readonly item: SelectorOptionData;
}

/**
 * Every selectable option (sections flattened, dividers skipped), each with
 * the option it was given as.
 */
export function getSelectableOptionEntries(
  options: SelectorOptionType[],
): SelectableOptionEntry[] {
  const result: SelectableOptionEntry[] = [];
  for (const option of options) {
    if (isOptionData(option)) {
      result.push({source: option, item: normalizeOption(option)});
    } else if (isSection(option)) {
      for (const opt of option.options) {
        result.push({source: opt, item: normalizeOption(opt)});
      }
    }
  }
  return result;
}

/**
 * Get all selectable options (flattening sections)
 */
export function getSelectableOptions(
  options: SelectorOptionType[],
): SelectorOptionData[] {
  return getSelectableOptionEntries(options).map(entry => entry.item);
}
