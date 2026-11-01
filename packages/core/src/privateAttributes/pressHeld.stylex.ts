// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/pressHeld.stylex.ts
 * @input A pressable surface, and whether its owner holds its press
 * @output setPressHeld, which holds or frees a surface's press, and
 *   isPressHeld, which the press controller reads
 * @position Owner module of the private press-held attribute
 *   (`architecture:public-component-api` INV23): the only file that writes
 *   its name. The swipe runtime holds an open row's press with it
 *   (Swipe/useSwipeAction.ts), and the press controller reads it
 *   (utils/pressFeedback.ts). No package entry exports it.
 *
 * A surface whose owner holds its press (an open swipe row) takes a press and
 * paints nothing, as a disabled one does: the surface around it does not
 * light either, a pressable inside it keeps its own press, and a touch on it
 * still counts for the brake. It is written on the pressable surface itself,
 * by the code that holds it, which frees it again; the surface stays
 * pressable. An open swipe row's root carries it, so a tap on its content
 * only closes the row (`spec:AST-057` FR7).
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
