// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file tokens.stylex.ts
 * @input StyleX variable definitions
 * @output Exports TransferList layout variables
 * @position Core component tokens consumed by TransferList.tsx; exported as
 *   transferListVars
 *
 * SYNC: When modified, update TransferList.tsx usage and TransferList.doc.mjs.
 */

import * as stylex from '@stylexjs/stylex';

/** Layout variables exposed for theme-level TransferList tuning. */
export const transferListVars = stylex.defineVars({
  '--transfer-list-panel-min-block-size': '12rem',
  '--transfer-list-panel-max-block-size': '20rem',
});
