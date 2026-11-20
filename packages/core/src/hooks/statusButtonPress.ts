// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file statusButtonPress.ts
 * @input A press target and the status tooltip id from useInputStatusIcon
 * @output Whether the press is on the status info-tip button
 * @position For fields that move focus to their input on a press anywhere in
 *   the field (Tokenizer, Typeahead), so a press on the info-tip keeps focus
 */

/**
 * Whether `target` is in the status info-tip button: the button that the
 * status tooltip `describedBy` describes. A field that moves focus to its
 * input on a press leaves a press on this button alone, so the tip can open.
 * The plain icon has no tooltip, so a press on it is not one.
 */
export function isStatusButtonPress(
  target: EventTarget | null,
  describedBy: string | undefined,
): boolean {
  return (
    describedBy != null &&
    target instanceof Element &&
    target.closest('button')?.getAttribute('aria-describedby') === describedBy
  );
}
