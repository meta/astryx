// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/treeExpander.stylex.ts
 * @input none
 * @output treeExpanderProps, which marks a tree table row's expander button,
 *   and treeExpanderIn, which finds it inside a row
 * @position Owner module of the private tree-expander attribute: the only
 *   file that writes its name or its selector. Table's tree plugin marks the
 *   button and finds it to link it to the row's children. No package entry
 *   exports it.
 */

const TREE_EXPANDER = 'data-astryx-tree-expander';

/** Spread on a tree table row's expander button. */
export const treeExpanderProps = {[TREE_EXPANDER]: ''} as const;

/** The expander button inside a row, or null for a leaf row. */
export function treeExpanderIn(row: Element): Element | null {
  return row.querySelector(`[${TREE_EXPANDER}]`);
}
