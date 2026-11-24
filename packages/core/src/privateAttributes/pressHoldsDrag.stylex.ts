// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/pressHoldsDrag.stylex.ts
 * @input Whether a pressable's own drag moves under the finger
 * @output pressHoldsDragProps, which marks such a pressable, and
 *   holdsPressThroughDrag, which reads the mark; markDragFlipped and
 *   NOT_DRAG_FLIPPED, which mark and skip a control whose drag flipped it
 * @position Owner module of the private press-holds-drag attributes: the only
 *   file that writes their names. Switch marks its row; the press controller
 *   (utils/pressFeedback.ts) keeps the press painted through that row's
 *   drag. Switch marks its input once a drag flips it; a menu sheet then
 *   leaves that press to the switch. No package entry exports them.
 */

const PRESS_HOLDS_DRAG = 'data-astryx-press-holds-drag';

/**
 * Spread on a pressable whose own drag the finger moves, such as a Switch's
 * thumb. The drag is not a scroll, so the press stays painted.
 */
export function pressHoldsDragProps(
  holdsDrag: boolean,
): Readonly<Record<string, string>> {
  return holdsDrag ? {[PRESS_HOLDS_DRAG]: ''} : {};
}

/** Whether the press on `element` stays painted through its drag. */
export function holdsPressThroughDrag(element: Element): boolean {
  return element.hasAttribute(PRESS_HOLDS_DRAG);
}

const DRAG_FLIPPED = 'data-astryx-drag-flipped';

/**
 * Marks `element` as the control of a press whose drag flipped it, or clears
 * the mark. The control decides that press's release itself.
 */
export function markDragFlipped(element: Element, flipped: boolean): void {
  element.toggleAttribute(DRAG_FLIPPED, flipped);
}

/** A selector suffix that skips a control whose current drag flipped it. */
export const NOT_DRAG_FLIPPED = `:not([${DRAG_FLIPPED}])`;
