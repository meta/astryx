// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/pressBox.stylex.ts
 * @input A control's box: the non-text part around its input and indicator
 * @output pressBoxProps, which marks the box, pressBoxAt, which finds the
 *   marked box that a press starts in, and pressBoxesIn, which lists the
 *   marked boxes a surface owns
 * @position Owner module of the private press-box attribute: the only file
 *   that writes its name. CheckboxInput and RadioListItem mark their boxes.
 *   utils/boxHold.ts reads the mark. The press controller and the container
 *   rule give a surface that owns a box the fine-pointer press. No package
 *   entry exports it.
 */

const PRESS_BOX = 'data-astryx-press-box';

/**
 * The public pressable marker (utils/pressFeedback.ts PRESSABLE_ATTRIBUTE).
 * The press controller imports this module, so this module cannot import it.
 */
const PRESSABLE = '[data-astryx-pressable]';

/** Spread on the box around a control's input and indicator. */
export const pressBoxProps: Readonly<Record<string, string>> = {
  [PRESS_BOX]: '',
};

/** The marked box that `target` is in, if `surface` contains it. */
export function pressBoxAt(
  target: EventTarget | null,
  surface: Element,
): HTMLElement | null {
  if (!(target instanceof Element)) {
    return null;
  }
  const box = target.closest(`[${PRESS_BOX}]`);
  return box instanceof HTMLElement && surface.contains(box) ? box : null;
}

/**
 * The marked boxes that `surface` owns: those inside it, with no other
 * pressable surface between the two.
 */
export function pressBoxesIn(surface: Element): Element[] {
  return Array.from(surface.querySelectorAll(`[${PRESS_BOX}]`)).filter(
    box => box.closest(PRESSABLE) === surface,
  );
}
