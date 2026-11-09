// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file privateAttributes/pressBox.stylex.ts
 * @input A control's box: the non-text part around its input and indicator
 * @output pressBoxProps, which marks the box, and pressBoxAt, which finds the
 *   marked box that a press starts in
 * @position Owner module of the private press-box attribute: the only file
 *   that writes its name. CheckboxInput and RadioListItem mark their boxes,
 *   and utils/boxHold.ts reads the mark. No package entry exports it.
 */

const PRESS_BOX = 'data-astryx-press-box';

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
