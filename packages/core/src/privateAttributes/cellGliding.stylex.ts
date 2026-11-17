// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/cellGliding.stylex.ts
 * @input Table sticky-cell divider custom properties
 * @output StyleX overrides for a pinned cell while its row glides
 * @position Owner module of the private cell-gliding attribute
 */

import * as stylex from '@stylexjs/stylex';

const CELL_GLIDING = '[data-astryx-cell-gliding]';
const DIVIDER_WIDTH =
  'var(--_table-row-divider-app-width, var(--_table-row-divider-width, 0px))';
const GLIDE_WIDTH = `var(--_table-row-glide-width, ${DIVIDER_WIDTH})`;

/** Conditional divider geometry for pinned cells in a gliding row. */
export const tableStickyCellGlidingStyles = stylex.create({
  cell: {
    '--_table-pinned-cell-divider-margin-bottom': {
      [CELL_GLIDING]: `calc(-1 * ${GLIDE_WIDTH})`,
    },
    '--_table-pinned-cell-divider-width': {
      [CELL_GLIDING]: GLIDE_WIDTH,
    },
    '--_table-pinned-cell-divider-style': {
      [CELL_GLIDING]: 'var(--_table-row-glide-style, solid)',
    },
    '--_table-pinned-cell-divider-color': {
      [CELL_GLIDING]: 'var(--_table-row-glide-color, var(--color-border))',
    },
    '--_table-pinned-cell-divider-background-size': {
      [CELL_GLIDING]: `100% ${GLIDE_WIDTH}`,
    },
  },
});
