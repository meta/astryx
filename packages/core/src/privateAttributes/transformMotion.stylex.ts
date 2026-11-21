// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/transformMotion.stylex.ts
 * @input A transform's transition duration (a turn, a slide, a scale)
 * @output transformMotion: the parts that drop that duration to zero when
 *   motion is reduced
 * @position Beside the reduced-motion mark's owner module
 *   (reducedMotion.stylex.ts), which this file does not load: that module
 *   stays free of StyleX for the script readers on every page. Theme writes
 *   `--_astryx-reduced-motion: 1` where it writes the mark (REDUCED_MOTION_PROPERTY
 *   in theme/themeMotion.ts). A style that transitions a transform builds its
 *   duration from these parts and never spells the property or the mark.
 *
 * Under reduced motion a transform lands at once, whether the person asks for
 * it or a theme reduces motion for everyone. A colour or opacity change keeps
 * its own duration.
 */

import * as stylex from '@stylexjs/stylex';

export const transformMotion = stylex.defineConsts({
  /**
   * 1, or 0 under a theme that reduces motion for everyone. Multiply the
   * transform's duration by it: `calc(<duration> * <factor>)`.
   */
  factor: '(1 - var(--_astryx-reduced-motion, 0))',
  /**
   * 0, or 0.01s under that theme. Add it for a slide whose end a script waits
   * for (`transitionend`, a close hold), so the slide still ends.
   */
  settle: '0.01s * var(--_astryx-reduced-motion, 0)',
  /** The media key for the person's Reduce Motion setting. */
  reduce: '@media (prefers-reduced-motion: reduce)',
});
