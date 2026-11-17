// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file privateAttributes/tableStickyPinnedCell.stylex.ts
 * @input StyleX, table theme tokens, private pinned-cell attributes
 * @output One complete sticky-column cell surface
 * @position Owner module for the private pinned-cell and gliding attributes
 *
 * The pseudo-element must stay in one StyleX object. Splitting its base
 * declarations from the attribute overrides lets a later object replace the
 * whole pseudo-element and silently drops the rest-state divider geometry.
 */

import * as stylex from '@stylexjs/stylex';
import {colorVars, durationVars, easeVars} from '../theme/tokens.stylex';
const PINNED_BASE = `var(--table-sticky-background, ${colorVars['--color-background-card']})`;
const DIVIDER_WIDTH =
  'var(--_table-row-divider-app-width, var(--_table-row-divider-width, 0px))';

const styles = stylex.create({
  cell: {
    position: 'sticky',
    backgroundColor: `var(--table-sticky-background, ${colorVars['--color-background-card']})`,
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

export const tableStickyPinnedCellStyles = styles.cell;
