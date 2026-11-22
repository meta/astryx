// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file containerBlockBleed.stylex.ts
 * @input Uses @stylexjs/stylex
 * @output containerBlockBleedStyles: the block-edge bleed publication that
 *   padding publishers share
 * @position Layout utility beside container() and containerCornerStyles.
 *   Internal: the package does not export it, and no API documents the
 *   `--_container-bleed-block-*` variables it sets. Only Table reads them.
 */

import * as stylex from '@stylexjs/stylex';

/**
 * Block-edge bleed publication for a padding publisher. Apply it on the
 * element that sets `--container-padding-block-*`.
 *
 * The publisher gives its block-start padding only to a first child that
 * bleeds to block edges (it carries `data-container-corner`), and its
 * block-end padding only to such a last child. The padding variables inherit
 * through wrappers and Stacks, so a reader deeper inside could pull a box it
 * does not close short. Then no bleed goes out. Corners follow the same rule.
 */
export const containerBlockBleedStyles = stylex.create({
  publish: {
    '--_container-bleed-block-start': {
      default: '0px',
      ':has(> [data-container-corner]:first-child)': {
        default: 'var(--container-padding-block-start, 0px)',
        ':has(> * [data-container-corner])': '0px',
      },
    },
    '--_container-bleed-block-end': {
      default: '0px',
      ':has(> [data-container-corner]:last-child)': {
        default: 'var(--container-padding-block-end, 0px)',
        ':has(> * [data-container-corner])': '0px',
      },
    },
  },
});
