// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';

/**
 * Scoped marker on a Link's root. The label reads the root's hover through
 * `stylex.when.ancestor()`, so the label takes the root's hover color in CSS.
 */
export const linkScope: ReturnType<typeof stylex.defineMarker> =
  stylex.defineMarker();
