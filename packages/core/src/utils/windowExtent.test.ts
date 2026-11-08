// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file windowExtent.test.ts
 * @input The shared window-width store and the stand-in maximum
 * @output One root observation for every subscriber, a stored width that
 *   follows it, and a maximum never below the value or the minimum
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
  it('listens to no window resize event, and reads innerWidth once per observation report', () => {
    const add = vi.spyOn(window, 'addEventListener');
    const width = vi.spyOn(window, 'innerWidth', 'get').mockReturnValue(640);
    const stops = [vi.fn(), vi.fn(), vi.fn()].map(listener =>
      subscribeToWindowWidth(listener),
    );
    expect(add.mock.calls.filter(([type]) => type === 'resize')).toHaveLength(
      0,
    );
    // The shared observation reports once when it starts; every subscriber
    // shares that one report.
    expect(width).toHaveBeenCalledTimes(1);
    expect(readWindowWidth()).toBe(640);
    window.dispatchEvent(new Event('resize'));
    readWindowWidth();
    expect(width).toHaveBeenCalledTimes(1);
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
