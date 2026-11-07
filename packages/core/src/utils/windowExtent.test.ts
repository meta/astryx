// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file windowExtent.test.ts
 * @input The shared window-width store and the stand-in maximum
 * @output One resize listener for every subscriber, a stored width that
 *   follows resizes, and a maximum never below the value or the minimum
 * @position Colocated verification for utils/windowExtent
 */

import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  readWindowWidth,
  standInMaximum,
  subscribeToWindowWidth,
} from './windowExtent';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('windowExtent', () => {
  it('shares one resize listener, and reads innerWidth only on a resize', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const stops = [vi.fn(), vi.fn(), vi.fn()].map(listener =>
      subscribeToWindowWidth(listener),
    );
    expect(add.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(
      1,
    );
    const width = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(640);
    // Reads between resizes come from the store.
    readWindowWidth();
    readWindowWidth();
    expect(width).not.toHaveBeenCalled();
    window.dispatchEvent(new Event('resize'));
    expect(width).toHaveBeenCalledTimes(1);
    expect(readWindowWidth()).toBe(640);
    for (const stop of stops) {
      stop();
    }
  });

  it('never states a maximum below the value or the minimum', () => {
    expect(standInMaximum(1280, 250, 60)).toBe(1280);
    expect(standInMaximum(300, 420, 60)).toBe(420);
    expect(standInMaximum(40, 20, 60)).toBe(60);
    expect(standInMaximum(null, 250, 60)).toBeUndefined();
  });
});
