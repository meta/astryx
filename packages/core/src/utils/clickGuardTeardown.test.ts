// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file clickGuardTeardown.test.ts
 * @input Two tests in order, the first ending with the click guard armed
 * @output No guard outlives the test that armed it: the shared test setup
 *   disarms every guard as each test ends, so its 400 ms timer never fires
 *   after the environment tears its window down
 * @position Test-isolation check for utils/clickGuard.ts; it has no
 *   afterEach of its own on purpose
 */

import {describe, expect, it} from 'vitest';
import {armClickGuard, isClickGuardArmed} from './clickGuard';

describe('the click guard between tests', () => {
  it('is armed by a gesture that ends a test', () => {
    armClickGuard(document);
    expect(isClickGuardArmed(document)).toBe(true);
  });

  it('is disarmed when the next test starts: no timer outlives the test that armed it', () => {
    expect(isClickGuardArmed(document)).toBe(false);
  });
});
