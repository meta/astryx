// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/selectionWash.ts
 * @input Whether a selected table row paints the selection wash.
 * @output `setSelectionWash`, which marks the row while it paints the wash,
 *   and the selector text the theme engine scopes a selected row's text to.
 * @position Owner module of the private selection-wash attribute. The table
 *   selection plugin writes it through theme/selectionWash.ts; its
 *   `.stylex.ts` sibling writes the row style that reads it, and the theme
 *   engine (theme/) reads it. No package entry exports it.
 */

const SELECTION_WASH = 'data-astryx-selection-wash';

/** Marks a table row while it paints the selection wash, or clears the mark. */
export function setSelectionWash(row: HTMLElement, painted: boolean): void {
  if (painted) {
    row.setAttribute(SELECTION_WASH, '');
  } else {
    row.removeAttribute(SELECTION_WASH);
  }
}

/** Matches a table row while it paints the selection wash. */
export const SELECTION_WASH_SELECTOR = `[${SELECTION_WASH}]`;
