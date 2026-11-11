// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/grownHitInput.stylex.ts
 * @input None.
 * @output grownHitInputProps, which marks an input that paints nothing and
 *   grows past its control to make a finger's target, and isGrownHitInput,
 *   which reads that mark
 * @position Owner module of the private grown-hit-input attribute: the only
 *   file that writes its name. Switch marks its grown input. The touch press
 *   check (utils/touchHitArea.ts) measures a marked input by its parent's box,
 *   which is what the person sees. No package entry exports it.
 */

const GROWN_HIT_INPUT = 'data-astryx-grown-hit-input';

/** Spread on an input that paints nothing and grows past its control. */
export const grownHitInputProps: Readonly<Record<string, string>> = {
  [GROWN_HIT_INPUT]: '',
};

/** Whether `element` is a marked grown hit input. */
export function isGrownHitInput(element: Element): boolean {
  return element.hasAttribute(GROWN_HIT_INPUT);
}
