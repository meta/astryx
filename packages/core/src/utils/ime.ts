// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file ime.ts
 * @input A keyboard event (a React event's `nativeEvent`, or a native DOM
 *   KeyboardEvent) with optional `isComposing` and `keyCode`
 * @output `isImeKeyEvent`: whether a keydown is part of an IME composition and
 *   must not act as a command
 * @position Shared low-level utility for every surface that handles Enter,
 *   Escape or arrows in `onKeyDown`
 */

// During IME composition (Korean, Japanese, Chinese), the browser fires a
// keydown to commit or cancel the composition before `compositionend`. A
// plain handler sees Enter or Escape and runs a command mid-composition. So
// return early on a composing keydown. Do not explain this again at call
// sites.
//
// Both signals are needed. `isComposing` is the standard signal. keyCode 229
// is the legacy fallback: some IMEs and older Safari send the composing
// keydown with `isComposing` not yet true, but with keyCode 229. Do not drop
// it without a browser-matrix audit.
//
// Prefer the native event (`e.nativeEvent`) from React handlers. The
// parameter is structurally typed, so both event shapes work. `keyCode` is
// deprecated in the DOM types but is still present at runtime.

/**
 * The sentinel `keyCode` that browsers report while an IME processes a key
 * event. See the note above for why this legacy signal stays.
 */
const IME_PROCESSING_KEY_CODE = 229;

export function isImeKeyEvent(event: {
  isComposing?: boolean;
  keyCode?: number;
}): boolean {
  return (
    event.isComposing === true || event.keyCode === IME_PROCESSING_KEY_CODE
  );
}
