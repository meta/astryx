// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tableStickyCell.stylex.ts
 * @input StyleX, table theme tokens
 * @output Shared sticky-cell styles for Table headers and sticky columns
 * @position Table style utility; imported by the core cell and sticky-column paths
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars, durationVars, easeVars} from '../theme/tokens.stylex';

// A pinned cell draws its own row divider. With collapsed borders the table
// paints every border at the cell's static place: a sticky cell moves, its
// border does not, so without this the line under a pinned column would be
// whichever scrolled cell's border passes beneath it, and missing where that
// cell has none.
const PINNED_BASE = `var(--table-sticky-background, ${colorVars['--color-background-card']})`;
const DIVIDER_WIDTH =
  'var(--_table-row-divider-app-width, var(--_table-row-divider-width, 0px))';

const stickyStyles = stylex.create({
  cell: {
    position: 'sticky',
    // Opaque base (overridable; defaults to the card token, the common
    // container) so scrolled content doesn't show through the pinned column.
    backgroundColor: `var(--table-sticky-background, ${colorVars['--color-background-card']})`,
    // Replay the row's overlay on a ::before layer (above the base, below text)
    // so the pinned column mirrors the row's striping/hover exactly via
    // --table-row-overlay. Transitions background-COLOR (not background-image)
    // so hover stays smooth at rest, not just when GPU-promoted while scrolled.
    '::before': {
      content: '""',
      position: 'absolute',
      inset: 0,
      zIndex: -1,
      pointerEvents: 'none',
      backgroundColor: 'var(--table-row-overlay, transparent)',
      // The divider: the layer reaches the bottom of the cell's border area,
      // paints the pinned base there (hiding the table's static border and any
      // scrolled cell's border), then the divider over it.
      marginBottom: `calc(-1 * ${DIVIDER_WIDTH})`,
      borderBottomWidth: DIVIDER_WIDTH,
      // While its row glides the cell's own border is transparent: the
      // divider is the row's, carried for the glide (glidingDivider.ts).
      borderBottomStyle: 'inherit',
      borderBottomColor: 'inherit',
      backgroundImage: `linear-gradient(${PINNED_BASE}, ${PINNED_BASE})`,
      backgroundSize: `100% ${DIVIDER_WIDTH}`,
      backgroundPosition: 'bottom',
      backgroundRepeat: 'no-repeat',
      backgroundOrigin: 'border-box',
      backgroundClip: 'border-box',
      transitionProperty: 'background-color',
      transitionDuration: durationVars['--duration-fast'],
      transitionTimingFunction: easeVars['--ease-standard'],
    },
    // padding-box keeps the base off the cell's collapsed divider border.
    backgroundClip: 'padding-box',
    // Sticky cells need visible overflow so the shadow ::after can bleed out.
    overflow: 'visible',
  },
  headerCell: {
    // Header cells stack above body cells; both stack above non-sticky cells.
    zIndex: 3,
  },
  bodyCell: {
    zIndex: 1,
  },
});

/** The opaque moving surface shared by pinned body and header cells. */
export const tableStickyCellStyles = stickyStyles.cell;

/** Stacking order for a pinned header cell. */
export const tableStickyHeaderCellStyles = stickyStyles.headerCell;

/** Stacking order for a pinned body cell. */
export const tableStickyBodyCellStyles = stickyStyles.bodyCell;
