// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/pressHeld.stylex.ts
 * @input A pressable surface, and whether its owner holds its press
 * @output setPressHeld, which holds or frees a surface's press, and
 *   isPressHeld, which the press controller reads
 * @position Owner module of the private press-held attribute
 *: the only file that writes
 *   its name. The swipe runtime holds an open row's press with it
 *   (Swipe/useSwipeAction.ts), and the press controller reads it
 *   (utils/pressFeedback.ts). No package entry exports it.
 *
 * A surface whose owner holds its press (an open swipe row) takes a press and
 * paints nothing, as a disabled one does. The surface around it does not light
 * either. A pressable inside it keeps its own press, and a touch on it still
 * counts for the brake. The code that holds it writes it on the pressable
 * surface itself, and frees it again; the surface stays pressable. An open
 * swipe row's root carries it, so a tap on its content only closes the row.
 */

const PRESS_HELD = 'data-astryx-press-held';

/** Holds a surface's press, or frees it. */
export function setPressHeld(surface: Element, isHeld: boolean): void {
  surface.toggleAttribute(PRESS_HELD, isHeld);
}

/** Whether a surface's owner holds its press. */
export function isPressHeld(surface: Element): boolean {
  return surface.hasAttribute(PRESS_HELD);
}
