// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file Search is warmed before the first keystroke, at most once per tab per
 * interval. The API's side is in search-warmup-route.test.ts.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {createCliSearchSource} from '../lib/cliSearchSource';
import {
  SEARCH_WARMUP_INTERVAL_MS,
  SEARCH_WARMUP_URL,
  SEARCH_WARMUP_WAIT_MS,
  resetSearchWarmup,
  searchServerReady,
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

/** A warm-up request the test answers when it chooses. */
function heldWarmup() {
  let answer: () => void = () => {};
  const fetchWarmup = vi.fn(
    () =>
      new Promise<void>(resolve => {
        answer = resolve;
      }),
  );
  return {fetchWarmup, answer: () => answer()};
}

const settledYet = async (promise: Promise<unknown>) => {
  let settled = false;
  promise.then(
    () => (settled = true),
    () => (settled = true),
  );
  for (let i = 0; i < 5; i++) {
    await Promise.resolve();
  }
  return settled;
};

describe('searchServerReady', () => {
  beforeEach(() => resetSearchWarmup());
  afterEach(() => vi.useRealTimers());

  it('is ready at once when no warm-up is running', async () => {
    expect(await settledYet(searchServerReady())).toBe(true);
  });

  it('waits for a running warm-up to answer', async () => {
    const warmup = heldWarmup();
    warmSearch(warmup.fetchWarmup, 1_000);
    const ready = searchServerReady();
    expect(await settledYet(ready)).toBe(false);
    warmup.answer();
    expect(await settledYet(ready)).toBe(true);
    // Once answered, nothing is running.
    expect(await settledYet(searchServerReady())).toBe(true);
  });

  it('stops waiting after the cap, so a stuck warm-up never holds results', async () => {
    vi.useFakeTimers();
    warmSearch(heldWarmup().fetchWarmup, 1_000);
    const ready = searchServerReady();
    vi.advanceTimersByTime(SEARCH_WARMUP_WAIT_MS - 1);
    expect(await settledYet(ready)).toBe(false);
    vi.advanceTimersByTime(1);
    expect(await settledYet(ready)).toBe(true);
  });

  it('rejects when the query is abandoned while it waits', async () => {
    warmSearch(heldWarmup().fetchWarmup, 1_000);
    const controller = new AbortController();
    const ready = searchServerReady(controller.signal);
    controller.abort(new Error('superseded'));
    await expect(ready).rejects.toThrow('superseded');
  });
});

describe('a query typed during a warm-up', () => {
  beforeEach(() => resetSearchWarmup());

  it('is sent only after the warm-up answers, to the server it started', async () => {
    const warmup = heldWarmup();
    warmSearch(warmup.fetchWarmup, 1_000);
    const fetchSearch = vi.fn((_url: string, _init: RequestInit) =>
      Promise.resolve(Response.json({data: {results: []}})),
    );
    const source = createCliSearchSource(fetchSearch);
    const results = source.search('app shell');
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(fetchSearch).not.toHaveBeenCalled();

    warmup.answer();
    await results;
    expect(fetchSearch).toHaveBeenCalledTimes(1);
    expect(fetchSearch.mock.calls[0][0]).toBe('/api/search?q=app%20shell');
  });
});
