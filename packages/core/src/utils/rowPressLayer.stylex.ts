// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rowPressLayer.stylex.ts
 * @input StyleX
 * @output The list row press layer's clocks (`cellPressConsts`)
 * @position Internal to core: no package entry exports it. Only the row
 *   layer (privateAttributes/press.stylex.ts) reads it, so a component
 *   without a press row ships none of it; interactionOverlay.exports.test.ts
 *   keeps it off the published paths.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * A list row's release (`rowPressLayerStyles.cell`), mirrored for the
 * stylesheet. StyleX evaluates a style at build time and cannot read the
 * constants table, so these are the table's press release values
 * (`timing.press`, motion/uikit/timing.ts). interactionOverlay.cell.test.ts
 * fails if they drift.
 */
export const cellPressConsts = stylex.defineConsts({
  /** `timing.press.highlightOutMs`, in ms. */
  cellReleaseMs: 200,
  /** `timing.press.highlightOutCurve`, as CSS. */
  cellReleaseEase: 'cubic-bezier(0, 0, 0.2, 1)',
});
