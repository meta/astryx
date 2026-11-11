// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file waitForPressClick.ts
 * @input An element a touch or pen press landed on
 * @output Exports waitForPressClick
 * @position Shared by the Layer touch trigger's tap recognizer and the
 *   deferred tooltip base. Imports nothing, so a component's eager code can
 *   wait for a tap without the Layer runtime.
 */

export interface WaitForPressClickOptions {
  /**
   * Whether a click still belongs to the press. A caller that tracks other
   * input (a key press, a new press elsewhere) returns false once it has.
   */
  isSamePress?: () => boolean;
  /** More event types on the element that end the wait, as a cancel does. */
  cancelOn?: ReadonlyArray<string>;
}

/**
 * Waits for the `click` of a press on `target`. The browser fires `click` for
 * a press it takes for a tap, and `pointercancel` for one it takes for a
 * scroll or a pinch, which ends the wait. Returns a function that stops
 * waiting.
 */
export function waitForPressClick(
  target: EventTarget,
  onClick: (click: Event) => void,
  {isSamePress, cancelOn = []}: WaitForPressClickOptions = {},
): () => void {
  const cancelTypes = ['pointercancel', ...cancelOn];
  const stop = () => {
    target.removeEventListener('click', handleClick);
    for (const type of cancelTypes) {
      target.removeEventListener(type, stop);
    }
  };
  const handleClick = (click: Event) => {
    stop();
    if (isSamePress == null || isSamePress()) {
      onClick(click);
    }
  };
  target.addEventListener('click', handleClick);
  for (const type of cancelTypes) {
    target.addEventListener(type, stop);
  }
  return stop;
}
