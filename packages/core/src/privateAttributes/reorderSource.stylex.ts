// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/reorderSource.stylex.ts
 * @input The row a reorder drag picked up
 * @output markReorderSource and clearReorderSource, which mark that row
 * @position Owner module of the private reorder-source attribute: the only
 *   file that writes its name. The reorder machinery
 *   (List/listReorderEngine.tsx) marks the dragged row, dimmed in its place
 *   while the drag runs. No package entry exports it.
 */

const REORDER_SOURCE = 'data-astryx-reorder-source';

/** Marks `row` as the row a drag picked up. */
export function markReorderSource(row: Element): void {
  row.setAttribute(REORDER_SOURCE, '');
}

/** Removes the mark from `row`. */
export function clearReorderSource(row: Element): void {
  row.removeAttribute(REORDER_SOURCE);
}
