// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file containerCorners.stylex.ts
 * @input Uses @stylexjs/stylex
 * @output containerCornerStyles: the corner publication rounded padding
 *   publishers share
 * @position Layout utility beside container(). Internal: the package does not
 *   export `containerCornerStyles`. The `--container-corner-*` variables it
 *   sets are in the shipped CSS, but no API documents them; only Table and
 *   List read them.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Corner publication for a rounded padding publisher (Card, Dialog). The host
 * sets `--_container-corner-block-start` and `--_container-corner-block-end` to
 * the radius at each block edge.
 *
 * A corner goes only to the host's first or last child when that child reads
 * corners (it carries `data-container-corner`). A reader deeper inside could
 * take a corner it does not reach, so then no corner goes out.
 */
export const containerCornerStyles = stylex.create({
  publish: {
    '--container-corner-start-start': {
      default: '0px',
      ':has(> [data-container-corner]:first-child)': {
        default: 'var(--_container-corner-block-start, 0px)',
        ':has(> * [data-container-corner])': '0px',
      },
    },
    '--container-corner-start-end': {
      default: '0px',
      ':has(> [data-container-corner]:first-child)': {
        default: 'var(--_container-corner-block-start, 0px)',
        ':has(> * [data-container-corner])': '0px',
      },
    },
    '--container-corner-end-start': {
      default: '0px',
      ':has(> [data-container-corner]:last-child)': {
        default: 'var(--_container-corner-block-end, 0px)',
        ':has(> * [data-container-corner])': '0px',
      },
    },
    '--container-corner-end-end': {
      default: '0px',
      ':has(> [data-container-corner]:last-child)': {
        default: 'var(--_container-corner-block-end, 0px)',
        ':has(> * [data-container-corner])': '0px',
      },
    },
  },
});
