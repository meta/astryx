// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/treeLevel.stylex.ts
 * @input A tree table row's 0-based depth
 * @output setTreeLevel and clearTreeLevel, which mark and unmark a row with
 *   its depth, and treeLevelOf, which reads it
 * @position Owner module of the private tree-level attribute: the only file
 *   that writes its name. Table's tree plugin marks each body row and reads
 *   the marks to find a row's children. No package entry exports it.
 */

const TREE_LEVEL = 'data-astryx-tree-level';

/** Marks a tree table row with its 0-based depth. */
export function setTreeLevel(row: Element, level: number): void {
  row.setAttribute(TREE_LEVEL, String(level));
}

/** Removes the depth mark from a row. */
export function clearTreeLevel(row: Element): void {
  row.removeAttribute(TREE_LEVEL);
}

/** The depth a row carries, or null for a row without a mark. */
export function treeLevelOf(row: Element): number | null {
  const value = row.getAttribute(TREE_LEVEL);
  return value == null ? null : Number(value);
}
