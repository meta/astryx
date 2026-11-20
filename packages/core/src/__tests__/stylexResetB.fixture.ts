// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexResetB.fixture.ts
 * @input StyleX
 * @output One rule under `@media (hover: hover) and (update: fast)`, injected when the module loads
 * @position Fixture for stylexMultiConditionMedia.test.ts (`vi.resetModules()`)
 */

import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
  rule: {
    opacity: {default: null, '@media (hover: hover) and (update: fast)': 0},
  },
});
