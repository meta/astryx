// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file theme/selectionWash.ts
 * @input A table row and whether it paints the selection wash.
 * @output `markSelectionWash`, which marks the row while it paints the wash,
 *   so its secondary text takes the value measured on the tint only there.
 * @position Internal; the table selection plugin calls it each time it paints
 *   or clears a row. Not exported from the theme barrel.
 */

import {setSelectionWash} from '../privateAttributes/selectionWash';

/** Marks a selected table row while it paints the selection wash. */
export function markSelectionWash(row: HTMLElement, painted: boolean): void {
  setSelectionWash(row, painted);
}
