// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/fieldFrame.stylex.ts
 * @input None.
 * @output fieldFrameProps, which marks a field's frame: the box a person sees
 *   around its entry, and closestFieldFrame, which finds the marked frame
 *   around an element
 * @position Owner module of the private field-frame attribute: the only file
 *   that writes its name. TextInput, TextArea, NumberInput and DateInput's
 *   native field mark their frames. The touch press check
 *   (utils/touchHitArea.ts) gives a tap on a marked frame to its entry. No
 *   package entry exports it.
 */

const FIELD_FRAME = 'data-astryx-field-frame';

/** Spread on a field's frame, the box around its entry. */
export const fieldFrameProps: Readonly<Record<string, string>> = {
  [FIELD_FRAME]: '',
};

/** The marked field frame that holds `element`, or null. */
export function closestFieldFrame(element: Element): Element | null {
  return element.closest(`[${FIELD_FRAME}]`);
}
