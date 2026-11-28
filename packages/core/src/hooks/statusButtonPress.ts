// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file statusButtonPress.ts
 * @input A press target, the status tooltip id from useInputStatusIcon, and
 *   the info-tip buttons that hook registers
 * @output Whether the press is on the status info-tip button, and
 *   `registerStatusButton`, the ref callback that registers one
 * @position For fields that move focus to their input on a press anywhere in
 *   the field (Tokenizer, Typeahead), so a press on the info-tip keeps focus
 */

import {sharedWeakSet} from '../utils/sharedRealm';

// The info-tip buttons on the page. A button is known from its first render,
// before its tooltip loads and gives it a description.
const statusButtons = sharedWeakSet<Element>(
  'hooks/status-button-press/status-buttons',
  1,
);

/** Ref callback for the status info-tip button useInputStatusIcon renders. */
export function registerStatusButton(
  button: HTMLButtonElement | null,
): (() => void) | undefined {
  if (button == null) {
    return undefined;
  }
  statusButtons.add(button);
  return () => {
    statusButtons.delete(button);
  };
}

/**
 * Whether `target` is in the status info-tip button. `describedBy` is the
 * status tooltip id from useInputStatusIcon: it is undefined when the field
 * has no info-tip. A field that moves focus to its input on a press leaves a
 * press on this button alone, so the tip can open. The plain icon has no
 * tooltip, so a press on it is not one.
 */
export function isStatusButtonPress(
  target: EventTarget | null,
  describedBy: string | undefined,
): boolean {
  if (describedBy == null || !(target instanceof Element)) {
    return false;
  }
  const button = target.closest('button');
  return button != null && statusButtons.has(button);
}
