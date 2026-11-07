// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tryItFocusGate.ts
 * @input A page-global switch that only the focus-depth try-it story sets
 * @output isTryItFocusGateOn, which ChatComposer and TextInput read as they
 *   render
 * @position NOT FOR LANDING: the switch behind a try-it story for the owner's
 *   card on focus depth under a finger
 */

const SWITCH = Symbol.for('@astryxdesign/core/try-it-focus-gate');

/** Whether the try-it story asks for focus depth only under a fine pointer. */
export function isTryItFocusGateOn(): boolean {
  return (globalThis as Record<symbol, unknown>)[SWITCH] === true;
}
