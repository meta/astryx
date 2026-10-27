// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file coarsePointer.test.ts
 * @input coarsePointer.ts, touchPresentation.ts and the gestures' pointer
 *   test helper
 * @output The gate's query is TOUCH_QUERY; it reads and follows the primary
 *   pointer
 * @position Unit tests of packages/core/src/utils/coarsePointer.ts
 */

import {describe, expect, it} from 'vitest';
import {TOUCH_QUERY} from './touchPresentation';
import {
  COARSE_POINTER_QUERY,
  isCoarsePointer,
  watchCoarsePointer,
} from './coarsePointer';
import {pointerQuery} from '../gestures/__tests__/pointerQuery';

describe('coarsePointer', () => {
  it("spells the touch presentation's query", () => {
    expect(COARSE_POINTER_QUERY).toBe(TOUCH_QUERY);
  });

  it('reads the primary pointer, and follows it until stopped', () => {
    const pointer = pointerQuery(false);
    try {
      expect(isCoarsePointer(window)).toBe(false);
      const seen: boolean[] = [];
      const stop = watchCoarsePointer(window, isCoarse => seen.push(isCoarse));
      pointer.set(true);
      expect(isCoarsePointer(window)).toBe(true);
      pointer.set(false);
      stop();
      pointer.set(true);
      expect(seen).toEqual([true, false]);
    } finally {
      pointer.restore();
    }
  });

  it('answers fine without a window', () => {
    expect(isCoarsePointer(null)).toBe(false);
    expect(watchCoarsePointer(null, () => {})).toBeTypeOf('function');
  });
});
