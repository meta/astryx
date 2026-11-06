// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file inputAge.test.ts
 * @input inputAge.ts
 * @output Unit tests for msSinceInput: an input's age on the page's clock, and
 *   now for a time off that clock
 * @position Testing; validates inputAge.ts
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {msSinceInput} from './inputAge';

describe('msSinceInput', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // The page has run a while, so an input's time is past zero.
    vi.advanceTimersByTime(1000);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("is the input's age when its time is on the page's clock", () => {
    expect(msSinceInput(performance.now() - 60)).toBe(60);
    expect(msSinceInput(performance.now())).toBe(0);
  });

  it('is zero for a time off that clock: zero, ahead of now, or an epoch time', () => {
    expect(msSinceInput(0)).toBe(0);
    expect(msSinceInput(performance.now() + 500)).toBe(0);
    expect(msSinceInput(Date.now())).toBe(0);
  });
});
