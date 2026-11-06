// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';

/** Constants the app defines itself, beside the file that reads them. */
export const appConsts = stylex.defineConsts({
  narrow: '@media (max-width: 599px)',
  rowHeight: '52px',
});
