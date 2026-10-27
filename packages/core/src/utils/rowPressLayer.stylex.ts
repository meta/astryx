// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rowPressLayer.stylex.ts
 * @input StyleX
 * @output The list row press layer's clocks (`cellPressConsts`)
 * @position Internal to core: core's `exports` do not list this module, so
 *   none of it is public API (`architecture:public-component-api` INV12).
 *   Read by interactionOverlay.stylex.ts (the overlay's release) and
 *   rowPressLayer.ts (the row layer); interactionOverlay.exports.test.ts
 *   holds it off the published paths.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * A list row's release (`rowPressLayerStyles.cell`, rowPressLayer.ts), mirrored for the stylesheet: StyleX evaluates
 * a style at build time and cannot read the constants table, so these are the
 * table's `list.highlight` values (motion/uikit/list.ts), and
 * interactionOverlay.cell.test.ts fails if they drift.
 */
export const cellPressConsts = stylex.defineConsts({
  /** `list.highlight.releaseMs`, in ms. */
  cellReleaseMs: 200,
  /** `list.highlight.releaseCurve`, as CSS. */
  cellReleaseEase: 'cubic-bezier(0, 0, 0.2, 1)',
});
