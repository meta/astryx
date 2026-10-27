// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file controlPressLayer.stylex.ts
 * @input StyleX
 * @output A control's touch press release clock and curve
 *   (`controlPressConsts`)
 * @position Internal to core: core's `exports` do not list this module, so
 *   none of it is public API (`architecture:public-component-api` INV12).
 *   Read by interactionOverlay.stylex.ts (the strength's release),
 *   controlPressLayer.ts (the control layers) and pressFeedback.ts (the
 *   controller's timer); interactionOverlay.exports.test.ts holds it off the
 *   published paths.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * A control's release, mirrored for the stylesheet: StyleX evaluates a style
 * at build time and cannot read the constants table, so these are the
 * table's `button.highlight` values (motion/uikit/button.ts), and
 * pressFeedback.test.ts fails if they drift.
 */
export const controlPressConsts = stylex.defineConsts({
  /**
   * How long a control's release takes, in ms: UIButton's highlight release
   * (`button.highlight.releaseMs`), for every surface not marked as a cell.
   */
  controlReleaseMs: 250,
  /**
   * A control's release curve, as CSS: UIButton's, UIKit's easeInEaseOut
   * (`button.highlight.releaseCurve`), for a surface that runs a control's
   * release on a layer of its own.
   */
  controlReleaseEase: 'cubic-bezier(0.42, 0, 0.58, 1)',
});
