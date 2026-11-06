// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file selectableOptionEntries.ts
 * @input Selector options, with sections and dividers
 * @output `getSelectableOptionEntries`: each selectable item with the option
 *   it was given as
 * @position Internal; the one walk behind utils.ts's `getSelectableOptions`
 *   and Selector's rows
 */

import type {SelectorOptionType, SelectorOptionData} from './types';
import {isOptionData, isSection, normalizeOption} from './optionShape';

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
