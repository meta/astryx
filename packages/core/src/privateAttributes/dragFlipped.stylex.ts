// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/dragFlipped.stylex.ts
 * @input A control whose current press is a drag that flipped it
 * @output markDragFlipped, which marks or clears that control, and
 *   isDragFlipped, which reads the mark
 * @position Owner module of the private drag-flipped attribute: the only
 *   file that writes its name. Switch marks its input once a drag flips it and clears the mark
 *   when the press ends; a menu sheet's hit test then leaves that press to
 *   the switch. No package entry exports it.
 */

const DRAG_FLIPPED = 'data-astryx-drag-flipped';

/**
 * Marks `element` as the control of a press whose drag flipped it, or clears
 * the mark. The control decides that press's release itself.
 */
export function markDragFlipped(element: Element, flipped: boolean): void {
  element.toggleAttribute(DRAG_FLIPPED, flipped);
}

/** Whether `element`'s current press is a drag that flipped it. */
export function isDragFlipped(element: Element): boolean {
  return element.hasAttribute(DRAG_FLIPPED);
}
