// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/tablePinned.stylex.ts
 * @input Table sticky-cell divider custom properties
 * @output StyleX overrides for a pinned cell carrying an app divider
 * @position Owner module of the private table-pinned attribute
 */

import * as stylex from '@stylexjs/stylex';

const CARRYING = '[data-astryx-table-pinned="carry"]';

/** Conditional divider colors for a pinned cell carrying an app border. */
export const tableStickyPinnedCarryStyles = stylex.create({
  cell: {
    '::before': {
      borderBottomStyle: {
        [CARRYING]: 'var(--_table-row-divider-app-style, solid)',
      },
      borderBottomColor: {
        [CARRYING]: 'var(--_table-row-divider-app-color, var(--color-border))',
      },
    },
  },
});
