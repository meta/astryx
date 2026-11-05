// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file touchHitArea.stylex.ts
 * @input Uses StyleX and the insets that utils/hitArea.ts writes on a host
 * @output Exports `touchHitAreaStyles.layer`, a host's invisible hit band
 *   under a coarse pointer
 * @position Internal styling utility for CheckboxInput and RadioListItem
 *
 * The band is the host's `::after`, grown past each edge by the measured
 * inset. A clip path cuts out the host's box, so its content keeps its taps.
 * A tap on the band lands on the host. SYNC: hitArea.ts HIT_INSET_PROPERTIES.
 */

import * as stylex from '@stylexjs/stylex';

// StyleX reads these at build time, so they are spelled out.
const TOUCH = '@media (pointer: coarse)';
// The insets are measured in the viewport, so the sides are physical.
const TOP = 'var(--astryx-hit-inset-top, 0px)';
const RIGHT = 'var(--astryx-hit-inset-right, 0px)';
const BOTTOM = 'var(--astryx-hit-inset-bottom, 0px)';
const LEFT = 'var(--astryx-hit-inset-left, 0px)';

export const touchHitAreaStyles = stylex.create({
  layer: {
    '::after': {
      content: {default: null, [TOUCH]: '""'},
      position: {default: null, [TOUCH]: 'absolute'},
      inset: {
        default: null,
        [TOUCH]: `calc(${TOP} * -1) calc(${RIGHT} * -1) calc(${BOTTOM} * -1) calc(${LEFT} * -1)`,
      },
      // The outer rectangle, then the host's box as an even-odd hole.
      clipPath: {
        default: null,
        [TOUCH]: `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ${LEFT} ${TOP}, calc(100% - ${RIGHT}) ${TOP}, calc(100% - ${RIGHT}) calc(100% - ${BOTTOM}), ${LEFT} calc(100% - ${BOTTOM}), ${LEFT} ${TOP})`,
      },
    },
  },
});
