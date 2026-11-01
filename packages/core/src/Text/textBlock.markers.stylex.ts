// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file textBlock.markers.stylex.ts
 * @input StyleX
 * @output The marker a Text carries when it renders as a block
 * @position Internal to core: not a package export, so not public API
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Marks a Text that renders as a block (`display="block"`, a line clamp, or
 * capsize), so an ancestor can lay itself out around a block child: a Link
 * keeps a flex box, and with it a painted focus ring, around one
 * (`component:Link` FR6, AR5).
 */
export const textBlockMarker: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
