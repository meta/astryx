// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file loopIndex.test.ts
 * @input Vitest and loopIndex.ts
 * @output Checks where an index falls on a loop and which copy is nearest
 * @position Unit coverage for the helper the pager and the wheel share
 */

import {describe, expect, it} from 'vitest';
import {mod, nearestLoopCopy} from './loopIndex';

describe('mod', () => {
  it('folds any index onto the loop, negative ones too', () => {
    expect(mod(61, 60)).toBe(1);
    expect(mod(-1, 60)).toBe(59);
    expect(mod(0, 60)).toBe(0);
  });
});

describe('nearestLoopCopy', () => {
  it('takes the copy nearest the index it starts from, across the seam', () => {
    expect(nearestLoopCopy(0, 58, 60)).toBe(60);
    expect(nearestLoopCopy(59, 1, 60)).toBe(-1);
    expect(nearestLoopCopy(5, 61, 60)).toBe(65);
    expect(nearestLoopCopy(10, 12, 60)).toBe(10);
  });

  it('keeps the index itself at an even tie, half a loop away', () => {
    expect(nearestLoopCopy(30, 0, 60)).toBe(30);
    expect(nearestLoopCopy(0, 30, 60)).toBe(0);
  });
});
