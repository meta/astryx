// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file setInputValue.ts
 * @input An input element and a new value
 * @output Sets the value as the user would, so the input's own change handler
 *   runs
 * @position Internal utility; used by TextInput's clear and Typeahead's
 *   edit and clear paths. Not exported from the utils entry.
 */

/**
 * Set `input`'s value through the native setter and dispatch an `input`
 * event. React tracks the value it last wrote, so a plain assignment fires no
 * `onChange`. The native setter makes React see a real change, and the event
 * reaches the input's own change handler with a real change event.
 */
export function setInputValue(input: HTMLInputElement, value: string): void {
  const setNativeValue = Object.getOwnPropertyDescriptor(
    input.ownerDocument.defaultView?.HTMLInputElement.prototype ??
      HTMLInputElement.prototype,
    'value',
  )?.set;
  setNativeValue?.call(input, value);
  input.dispatchEvent(new Event('input', {bubbles: true}));
}
