// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file text.markers.stylex.ts
 * @input StyleX
 * @output The markers a Text carries, for ancestors and descendants to lay
 *   themselves out around it
 * @position Internal to core: not a package export, so not public API
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Marks every Text root, so an element inside running text can tell it is in
 * inline flow: a Link inside a Text lays its label out as inline text
 * (`component:Link` FR6).
 */
export const textScopeMarker: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();

/**
 * Marks a Text that renders as a block (`display="block"`, a line clamp, or
 * capsize), so an ancestor can lay itself out around a block child: a Link
 * keeps a flex box, and with it a painted focus ring, around one
 * (`component:Link` FR6, AR5).
 */
export const textBlockMarker: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
