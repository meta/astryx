// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * A plain export, not `defineVars`/`defineConsts`: StyleX compiles a read of
 * it in another file to a custom property that nothing declares.
 */
export const plainTokens = {gap: '12px'};
