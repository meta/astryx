// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexResetC.fixture.ts
 * @input StyleX
 * @output One rule under `@media (hover: none) and (update: slow)`, injected when the module loads
 * @position Fixture for stylexMultiConditionMedia.test.ts (`vi.resetModules()`)
 */

import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
  rule: {
    color: {default: null, '@media (hover: none) and (update: slow)': 'blue'},
  },
});
