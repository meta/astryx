// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/listReorder.stylex.ts
 * @input A reorder handle: a reorderable List row's, or an attached one's
 * @output listReorderHandleProps and markReorderHandle, which mark a handle,
 *   and closestReorderHandle and reorderHandlesIn, which find marked handles
 * @position Owner module of the private list-reorder attribute: the only
 *   file that writes its name. List/ListReorderHandle.tsx and
 *   reorderable/attachReorderable.ts mark handles, and the reorder machinery
 *   (List/listReorderEngine.tsx) finds them. No package entry exports it.
 */

const LIST_REORDER = 'data-astryx-list-reorder';

/** Spread on each reorder handle. */
export const listReorderHandleProps: Readonly<Record<string, string>> = {
  [LIST_REORDER]: '',
};

/**
 * Marks `handle` as a reorder handle, for a handle no component renders;
 * returns the removal, which puts back what was there.
 */
export function markReorderHandle(handle: Element): () => void {
  const had = handle.getAttribute(LIST_REORDER);
  handle.setAttribute(LIST_REORDER, '');
  return () => {
    if (had == null) {
      handle.removeAttribute(LIST_REORDER);
    } else {
      handle.setAttribute(LIST_REORDER, had);
    }
  };
}

/** The reorder handle that holds `target`, or null. */
export function closestReorderHandle(target: Element): HTMLElement | null {
  return target.closest<HTMLElement>(`[${LIST_REORDER}]`);
}

/** The reorder handles inside `root`. */
export function reorderHandlesIn(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(`[${LIST_REORDER}]`));
}
