// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';

/**
 * Constants on the library side of the layer split (the build test points
 * `libraryPattern` at this folder), read by an app file on the product side.
 */
export const libraryConsts = stylex.defineConsts({
  wide: '@media (min-width: 900px)',
  inset: '13px',
});
