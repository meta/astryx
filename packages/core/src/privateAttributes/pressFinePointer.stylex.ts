// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/pressFinePointer.stylex.ts
 * @input Whether a pressable surface paints a mouse's press through the press
 *   controller where the primary pointer is fine
 * @output pressFinePointerProps, which marks such a surface, and
 *   paintsFinePointerPress, which reads the mark
 * @position Owner module of the private fine-pointer press attribute: the
 *   only file that writes its name. CheckboxInput, CheckboxListItem and
 *   RadioListItem mark their rows, and load the primary-click rule through
 *   utils/finePress.ts. The press controller (utils/pressFeedback.ts) then
 *   paints a mouse's or a pen's press there at `pointerdown`, as it paints a
 *   finger's. No package entry exports it.
 */

const PRESS_FINE_POINTER = 'data-astryx-press-fine-pointer';

/**
 * Spread on a pressable surface whose press paint reads the press controller
 * for every pointer. The controller then paints a mouse's or a pen's press at
 * once and fades it on release, in place of `:active`. A link or a button
 * nested in the surface takes its own press.
 */
export function pressFinePointerProps(
  paintsFinePress: boolean,
): Readonly<Record<string, string>> {
  return paintsFinePress ? {[PRESS_FINE_POINTER]: ''} : {};
}

/** Whether the press controller paints a fine pointer's press on `element`. */
export function paintsFinePointerPress(element: Element): boolean {
  return element.hasAttribute(PRESS_FINE_POINTER);
}
