// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file enabledEdgeIndex.ts
 * @input A list of options and a direction
 * @output The index of the first, or the last, option that is not disabled
 * @position Internal utility; Selector's and MultiSelector's combobox hooks
 *   pick the option a closed list opens on with it. Not exported from the
 *   utils entry.
 */

/**
 * The index of the first option that is not disabled, or of the last one
 * when `fromEnd` is true. -1 when every option is disabled.
 */
export function enabledEdgeIndex(
  items: ReadonlyArray<{disabled?: boolean}>,
  fromEnd: boolean,
): number {
  if (fromEnd) {
    for (let index = items.length - 1; index >= 0; index--) {
      if (items[index].disabled !== true) {
        return index;
      }
    }
    return -1;
  }
  return items.findIndex(item => item.disabled !== true);
}
