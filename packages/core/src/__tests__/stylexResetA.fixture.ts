// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexResetA.fixture.ts
 * @input StyleX
 * @output One rule under `@media (hover: hover) and (update: fast)`, injected when the module loads
 * @position Fixture for stylexMultiConditionMedia.test.ts (`vi.resetModules()`)
 */

import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
  rule: {
    color: {default: null, '@media (hover: hover) and (update: fast)': 'red'},
  },
});
