// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file A contrast ratio just under what a check needs is said cut down,
 * never rounded up to read as meeting it ("4.5:1, needs 4.5:1").
 */

import {describe, expect, it} from 'vitest';
import {ratioWords} from './_color.mjs';

describe('a ratio as a result says it', () => {
  it('is cut down to two decimals, never rounded up', () => {
    expect(ratioWords(4.4999)).toBe('4.49');
    expect(ratioWords(4.497)).toBe('4.49');
    expect(ratioWords(4.5)).toBe('4.50');
    expect(ratioWords(2.995)).toBe('2.99');
    expect(ratioWords(21)).toBe('21.00');
  });
});
