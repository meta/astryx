// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/reordering.stylex.ts
 * @input A reorderable List's root while a drag or a reorder-mode move owns
 *   its rows
 * @output markReordering and clearReordering, which mark the list, and
 *   isReordering, which reads the mark. reorderingHandleStyles shows a
 *   handle's grabbing cursor while its list is marked.
 * @position Owner module of the private reordering attribute: the only file
 *   that writes its name. The reorder machinery (List/listReorderEngine.tsx)
 *   marks the list, and List's layout updates leave its commits alone while
 *   it is marked. No package entry exports it.
 */

import * as stylex from '@stylexjs/stylex';

const REORDERING = 'data-astryx-reordering';

/** Marks `list` while the reorder owns its rows. */
export function markReordering(list: Element): void {
  list.setAttribute(REORDERING, '');
}

/** Removes the mark from `list`. */
export function clearReordering(list: Element): void {
  list.removeAttribute(REORDERING);
}

/** Whether the reorder owns `list`'s rows. */
export function isReordering(list: Element): boolean {
  return list.hasAttribute(REORDERING);
}

export const reorderingHandleStyles = stylex.create({
  // Grabbing while its list reorders: a drag holds the pointer. Not
  // `:active`: that is the touch press controller's arm, and the handle
  // paints no press.
  cursor: {
    cursor: {
      default: 'grab',
      ':is([data-astryx-reordering] *)': 'grabbing',
      ':is(:disabled,[aria-disabled="true"])': 'default',
    },
  },
});
