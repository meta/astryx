// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/listReorder.stylex.ts
 * @input A reorderable List row's reorder handle
 * @output listReorderHandleProps, which marks a handle, and
 *   closestReorderHandle and reorderHandlesIn, which find marked handles
 * @position Owner module of the private list-reorder attribute: the only
 *   file that writes its name. List/ListReorderHandle.tsx marks each handle,
 *   and the reorder machinery (List/listReorderEngine.tsx) finds them. No
 *   package entry exports it.
 */

const LIST_REORDER = 'data-astryx-list-reorder';

/** Spread on each reorder handle. */
export const listReorderHandleProps: Readonly<Record<string, string>> = {
  [LIST_REORDER]: '',
};

/** The reorder handle that holds `target`, or null. */
export function closestReorderHandle(target: Element): HTMLElement | null {
  return target.closest<HTMLElement>(`[${LIST_REORDER}]`);
}

/** The reorder handles inside `root`. */
export function reorderHandlesIn(root: ParentNode): Element[] {
  return Array.from(root.querySelectorAll(`[${LIST_REORDER}]`));
}
