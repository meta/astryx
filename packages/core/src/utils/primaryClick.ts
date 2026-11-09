// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file primaryClick.ts
 * @input A mouse or pen button press: its `button` and `ctrlKey`
 * @output Exports isPrimaryClick
 * @position Internal util, the one primary-click rule: the gesture host
 *   starts a press only for one, and the press controller paints only one;
 *   platform detection is utils/isApplePlatform.ts
 *
 * Deliberately absent from utils/index.ts: packages/core/src/index.ts does
 * `export * from './utils'`, so naming it there would publish it as API.
 */

import {isApplePlatform} from './isApplePlatform';

/**
 * Whether a button press is a primary click: the main button, and not a
 * ctrl-click on macOS or iPadOS, which is that platform's context click
 * (`spec:AST-094` FR43). A right click, a pen's barrel button and a macOS
 * ctrl-click start no press.
 */
export function isPrimaryClick(event: {
  readonly button: number;
  readonly ctrlKey: boolean;
}): boolean {
  return event.button === 0 && !(event.ctrlKey && isApplePlatform());
}
