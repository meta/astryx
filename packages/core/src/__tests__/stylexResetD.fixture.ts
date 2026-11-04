// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file stylexResetD.fixture.ts
 * @input StyleX
 * @output One rule under `@media (hover: none) and (update: slow)`, injected when the module loads
 * @position Fixture for stylexMultiConditionMedia.test.ts (`vi.resetModules()`)
 */

import * as stylex from '@stylexjs/stylex';

export const styles = stylex.create({
  rule: {
    opacity: {default: null, '@media (hover: none) and (update: slow)': 0.5},
  },
});
