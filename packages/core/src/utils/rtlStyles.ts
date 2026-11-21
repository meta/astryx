// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file rtlStyles.ts
 * @input None
 * @output Shared StyleX style that horizontally mirrors an element under RTL
 * @position Core utility; applied to directional icons in Calendar, Lightbox,
 *   Pagination, Carousel and the Table expand/disclosure plugins
 *
 * SYNC: When modified, update:
 * - /packages/core/src/utils/index.ts
 */

// `mirror` uses `scaleX(-1)`, not `scale(-1, -1)`, so the vertical axis
// stays. Apply it outside any state-driven rotation, so a disclosure chevron
// still rotates down under RTL. It matches `:is([dir="rtl"] *)`, so
// `direction: rtl` alone does not trigger it.
//
// `centerInline` uses physical `left: 50%` and `translateX(-50%)` on purpose.
// Both use the same physical edge, so the element centers in LTR and RTL. A
// logical `insetInlineStart: 50%` flips the anchor in RTL but the translate
// does not, so the element is off by its own width. The lint suppression
// lives here once, and `@astryx/no-physical-properties` points offenders
// here. `blockOffset` is a translateY length: `'100%'` sits the element one
// height below its anchor, and `'-50%'` centers it on both axes.

import * as stylex from '@stylexjs/stylex';

export const rtlStyles = stylex.create({
  mirror: {
    transform: {default: null, ':is([dir="rtl"] *)': 'scaleX(-1)'},
  },
  centerInline: (blockOffset: string) => ({
    // eslint-disable-next-line @astryx/no-physical-properties -- intentional: physical left+translateX(-50%) is direction-symmetric and the correct way to center; a logical anchor would break RTL centering (see file header).
    left: '50%',
    transform: `translate(-50%, ${blockOffset})`,
  }),
});
