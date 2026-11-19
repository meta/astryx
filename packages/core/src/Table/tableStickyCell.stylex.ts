// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableStickyCell.stylex.ts
 * @input StyleX, table theme tokens
 * @output Shared sticky-cell styles for Table headers and sticky columns
 * @position Table style utility; imported by the core cell and sticky-column paths
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars, durationVars, easeVars} from '../theme/tokens.stylex';

const PINNED_BASE = `var(--table-sticky-background, ${colorVars['--color-background-card']})`;
const DIVIDER_WIDTH =
  'var(--_table-row-divider-app-width, var(--_table-row-divider-width, 0px))';

/**
 * The complete surface for a cell that is pinned to the inline edge.
 *
 * Keep the pseudo-element in this one StyleX object. Attribute-specific
 * overrides are expressed through custom properties so they do not replace
 * the base divider geometry. Table headers use the same layer so their
 * separator moves with the sticky cell instead of staying in the collapsed
 * table border.
 */
const pinnedCellStyles = stylex.create({
  cell: {
    position: 'sticky',
    backgroundColor: PINNED_BASE,
    '::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      zIndex: -1,
      pointerEvents: 'none',
      backgroundColor: 'var(--table-row-overlay, transparent)',
      marginBottom: {
        default: `var(--_table-pinned-cell-divider-margin-bottom, calc(-1 * ${DIVIDER_WIDTH}))`,
      },
      borderBottomWidth: {
        default: `var(--_table-pinned-cell-divider-width, ${DIVIDER_WIDTH})`,
      },
      borderBottomStyle: {
        default: 'var(--_table-pinned-cell-divider-style, inherit)',
      },
      borderBottomColor: {
        default: 'var(--_table-pinned-cell-divider-color, inherit)',
      },
      backgroundImage: `linear-gradient(${PINNED_BASE}, ${PINNED_BASE})`,
      backgroundSize: {
        default: `var(--_table-pinned-cell-divider-background-size, 100% ${DIVIDER_WIDTH})`,
      },
      backgroundPosition: 'bottom',
      backgroundRepeat: 'no-repeat',
      backgroundOrigin: 'border-box',
      backgroundClip: 'border-box',
      transitionProperty: 'background-color',
      transitionDuration: durationVars['--duration-fast'],
      transitionTimingFunction: easeVars['--ease-standard'],
    },
    backgroundClip: 'padding-box',
    overflow: 'visible',
  },
});

/** Surface and moving divider shared by pinned columns and sticky headers. */
export const tableStickyPinnedCellStyles = pinnedCellStyles.cell;

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
