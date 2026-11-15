// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file domainTokens/domainTokenDefaults.ts
 * @input syntaxTokenDefaults, dataTokenDefaults
 * @output domainTokenDefaults
 * @position Merges the domain token defaults for defineTheme. Kept out of the
 *   domainTokens barrel because defineTheme sits in a lazily imported module
 *   graph, which imports no barrel (pinned by scripts/core-single-bundle.test.mjs).
 */

import {syntaxTokenDefaults} from '../syntax/tokens';
import {dataTokenDefaults} from './dataTokens';

/** All domain token defaults merged — used by defineTheme for validation */
export const domainTokenDefaults: Record<string, string> = {
  ...syntaxTokenDefaults,
  ...dataTokenDefaults,
};
