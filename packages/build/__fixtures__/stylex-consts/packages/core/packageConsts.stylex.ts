// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';

/**
 * Constants as an Astryx package defines them: the path holds `packages/core/`,
 * so the babel wrapper compiles this file with the library class-name prefix
 * (`astryx`), as it does a real package. The app file reading them compiles
 * with its own prefix (`x`).
 */
export const packageConsts = stylex.defineConsts({
  gap: '17px',
});
