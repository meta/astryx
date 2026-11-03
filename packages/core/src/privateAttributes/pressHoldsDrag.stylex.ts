// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/pressHoldsDrag.stylex.ts
 * @input Whether a pressable's own drag moves under the finger
 * @output pressHoldsDragProps, which marks such a pressable, and
 *   holdsPressThroughDrag, which reads the mark
 * @position Owner module of the private press-holds-drag attribute: the only
 *   file that writes its name. Switch marks its row; the press controller
 *   (utils/pressFeedback.ts) keeps the press painted through that row's
 *   drag. No package entry exports it.
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
