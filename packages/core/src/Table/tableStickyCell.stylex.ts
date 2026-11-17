// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableStickyCell.stylex.ts
 * @input StyleX, table theme tokens
 * @output Shared sticky-cell styles for Table headers and sticky columns
 * @position Table style utility; imported by the core cell and sticky-column paths
 */

import * as stylex from '@stylexjs/stylex';

/** Stacking order for cells that the sticky-columns plugin pins. */

const stickyStyles = stylex.create({
  headerCell: {
    // Header cells stack above body cells; both stack above non-sticky cells.
    zIndex: 3,
  },
  bodyCell: {
    zIndex: 1,
  },
});

/** Stacking order for a pinned header cell. */
export const tableStickyHeaderCellStyles = stickyStyles.headerCell;

/** Stacking order for a pinned body cell. */
export const tableStickyBodyCellStyles = stickyStyles.bodyCell;
