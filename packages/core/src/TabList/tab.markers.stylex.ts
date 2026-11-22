// Copyright (c) Meta Platforms, Inc. and affiliates.

import * as stylex from '@stylexjs/stylex';

/**
 * Scoped marker for TabMenu's trigger. Its hover layer reads the trigger's
 * hover through it, so an outer container's hover does not leak in.
 */
export const tabScope = stylex.defineMarker();
