// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file Search is warmed before the first keystroke, at most once per tab per
 * interval. The API's side is in search-warmup-route.test.ts.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {
  SEARCH_WARMUP_INTERVAL_MS,
  SEARCH_WARMUP_URL,
  resetSearchWarmup,
  warmSearch,
  whenIdle,
} from '../lib/searchWarmup';

describe('warmSearch', () => {
  beforeEach(() => resetSearchWarmup());

  it('sends one uncached warm-up request', () => {
    const fetchWarmup = vi.fn(() => Promise.resolve());
    expect(warmSearch(fetchWarmup, 1_000)).toBe(true);
    expect(fetchWarmup).toHaveBeenCalledTimes(1);
    expect(fetchWarmup).toHaveBeenCalledWith(SEARCH_WARMUP_URL, {
      cache: 'no-store',
    });
  });

  it('sends nothing again within the interval, however often it is asked', () => {
    const fetchWarmup = vi.fn(() => Promise.resolve());
    warmSearch(fetchWarmup, 1_000);
    for (let i = 0; i < 20; i++) {
      expect(warmSearch(fetchWarmup, 1_000 + i * 1_000)).toBe(false);
    }
    expect(fetchWarmup).toHaveBeenCalledTimes(1);
  });

  it('warms again once the interval has passed', () => {
    const fetchWarmup = vi.fn(() => Promise.resolve());
    warmSearch(fetchWarmup, 1_000);
    expect(warmSearch(fetchWarmup, 1_000 + SEARCH_WARMUP_INTERVAL_MS)).toBe(
      true,
    );
    expect(fetchWarmup).toHaveBeenCalledTimes(2);
  });

  it('keeps throttling across a reload of the tab', () => {
    const fetchWarmup = vi.fn(() => Promise.resolve());
    warmSearch(fetchWarmup, 1_000);
    // A reload loses module state; the tab's sessionStorage keeps the time.
    expect(window.sessionStorage.length).toBe(1);
    expect(warmSearch(fetchWarmup, 2_000)).toBe(false);
  });

  it('never throws when the request fails', async () => {
    const rejecting = vi.fn(() => Promise.reject(new Error('offline')));
    expect(warmSearch(rejecting, 1_000)).toBe(true);
    await Promise.resolve();
    resetSearchWarmup();
    const throwing = vi.fn(() => {
      throw new Error('no fetch');
    });
    expect(() => warmSearch(throwing, 1_000)).not.toThrow();
  });
});

describe('whenIdle', () => {
  afterEach(() => vi.useRealTimers());

  it('runs the task after the fallback delay without an idle callback, and can be cancelled', () => {
    vi.useFakeTimers();
    const task = vi.fn();
    whenIdle(task, 2_000);
    vi.advanceTimersByTime(1_999);
    expect(task).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(task).toHaveBeenCalledTimes(1);

    const cancelled = vi.fn();
    const cancel = whenIdle(cancelled, 2_000);
    cancel();
    vi.advanceTimersByTime(5_000);
    expect(cancelled).not.toHaveBeenCalled();
  });
});
