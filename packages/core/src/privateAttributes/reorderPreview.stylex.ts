// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/reorderPreview.stylex.ts
 * @input The copy of a dragged row that follows the pointer
 * @output markReorderPreview, which marks that copy
 * @position Owner module of the private reorder-preview attribute: the only
 *   file that writes its name. The reorder machinery
 *   (List/listReorderEngine.tsx) marks the preview it draws. No package
 *   entry exports it.
 */

const REORDER_PREVIEW = 'data-astryx-reorder-preview';

/** Marks `element` as the preview of the dragged row. */
export function markReorderPreview(element: Element): void {
  element.setAttribute(REORDER_PREVIEW, '');
}
