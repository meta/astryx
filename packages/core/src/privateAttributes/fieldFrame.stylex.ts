// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/fieldFrame.stylex.ts
 * @input None.
 * @output fieldFrameProps, which marks a field's box: the frame a person sees
 *   around its entry, or a box whose own click forwards to the field, and
 *   closestFieldFrame, which finds the marked box around an element
 * @position Owner module of the private field-frame attribute: the only file
 *   that writes its name. Core's fields mark their boxes. The touch press
 *   check (utils/touchHitArea.ts) gives a tap on a marked box to its entry,
 *   or to the box's own click. No package entry exports it.
 */

const FIELD_FRAME = 'data-astryx-field-frame';

/** Spread on a field's frame, or a box whose click forwards to the field. */
export const fieldFrameProps: Readonly<Record<string, string>> = {
  [FIELD_FRAME]: '',
};

/** The marked field box that holds `element`, or null. */
export function closestFieldFrame(element: Element): Element | null {
  return element.closest(`[${FIELD_FRAME}]`);
}
