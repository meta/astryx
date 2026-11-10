// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A throwaway release spec that fails, to show that a pull request
 *   changing a release spec runs it in `release-specs (changed)`. Never merge.
 */

import {expect, test} from '@playwright/test';

test('a changed release spec runs on the pull request, and this one fails', () => {
  expect(1).toBe(2);
});
