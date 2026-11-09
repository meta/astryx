// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file coarsePointer.test.ts
 * @input coarsePointer.ts and the gestures' pointer test helper
 * @output The gate reads and follows the primary pointer, and reads and
 *   watches any media query, also where the window has no matchMedia
 * @position Unit tests of packages/core/src/utils/coarsePointer.ts
 */

import {describe, expect, it} from 'vitest';
import {
  isCoarsePointer,
  matchesMediaQuery,
  watchCoarsePointer,
  watchMediaQuery,
} from './coarsePointer';
import {pointerQuery} from '../gestures/__tests__/pointerQuery';

describe('coarsePointer', () => {
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

  it('reads any media query, and matches nothing where the window has no matchMedia', () => {
    const view = {
      matchMedia: (query: string) => ({
        media: query,
        matches: query === '(max-width: 600px)',
      }),
    } as unknown as Window;
    expect(matchesMediaQuery(view, '(max-width: 600px)')).toBe(true);
    expect(matchesMediaQuery(view, '(min-width: 601px)')).toBe(false);
    const bare = {} as unknown as Window;
    expect(matchesMediaQuery(bare, '(max-width: 600px)')).toBe(false);
    expect(watchMediaQuery(bare, '(max-width: 600px)', () => {})).toBeTypeOf(
      'function',
    );
  });

  it('watches any media query, through the older pair where there is no addEventListener', () => {
    const handlers = new Set<() => void>();
    let matches = false;
    const view = {
      matchMedia: (query: string) => ({
        media: query,
        get matches() {
          return matches;
        },
        addListener: (handler: () => void) => handlers.add(handler),
        removeListener: (handler: () => void) => handlers.delete(handler),
      }),
    } as unknown as Window;
    const seen: boolean[] = [];
    const stop = watchMediaQuery(view, '(max-width: 600px)', next =>
      seen.push(next),
    );
    matches = true;
    for (const handler of Array.from(handlers)) {
      handler();
    }
    stop();
    expect(seen).toEqual([true]);
    expect(handlers.size).toBe(0);
  });
});
