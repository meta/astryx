// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/leaving.stylex.ts
 * @input A List row put back in the document for its exit
 * @output markLeaving, which marks such a row, and isLeaving, which reads the
 *   mark
 * @position Owner module of the private leaving attribute: the only file that
 *   writes its name. List/listLayoutUpdates.ts marks a row it puts back, so no
 *   later commit counts it as a row. No package entry exports it.
 */

const LEAVING = 'data-astryx-leaving';

/** Marks `row` as put back for its exit: it is not a row any more. */
export function markLeaving(row: Element): void {
  row.setAttribute(LEAVING, '');
}

/** Whether `row` was put back for its exit. */
export function isLeaving(row: Element): boolean {
  return row.hasAttribute(LEAVING);
}
