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
  resetSearchWarmup,
  runningSearchWarmup,
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

const flush = async () => {
  for (let i = 0; i < 10; i++) {
    await Promise.resolve();
  }
};

describe('runningSearchWarmup', () => {
  beforeEach(() => resetSearchWarmup());

  it('is null when no warm-up is running, and settles when one answers', async () => {
    expect(runningSearchWarmup()).toBeNull();
    const warmup = heldWarmup();
    warmSearch(warmup.fetchWarmup, 1_000);
    const running = runningSearchWarmup();
    expect(running).not.toBeNull();
    warmup.answer();
    await running;
    expect(runningSearchWarmup()).toBeNull();
  });

  it('settles, never rejects, when the warm-up fails', async () => {
    warmSearch(() => Promise.reject(new Error('offline')), 1_000);
    await expect(runningSearchWarmup()).resolves.toBeUndefined();
  });
});

/** A search fetch whose answers the test releases one by one. */
function heldSearch() {
  const pending: {
    url: string;
    signal: AbortSignal;
    answer: (results: {href: string; name: string}[]) => void;
  }[] = [];
  const fetchSearch = vi.fn(
    (url: string, init: RequestInit) =>
      new Promise<Response>((resolve, reject) => {
        const signal = init.signal as AbortSignal;
        signal.addEventListener('abort', () => reject(signal.reason));
        pending.push({
          url,
          signal,
          answer: results =>
            resolve(
              Response.json({
                data: {
                  results: results.map(result => ({
                    domain: 'component',
                    ...result,
                  })),
                },
              }),
            ),
        });
      }),
  );
  return {fetchSearch, pending};
}

describe('a query typed during a warm-up', () => {
  beforeEach(() => resetSearchWarmup());

  it('is sent at once, so an answer the cache holds is not held back', async () => {
    warmSearch(heldWarmup().fetchWarmup, 1_000);
    const search = heldSearch();
    const source = createCliSearchSource(search.fetchSearch);
    const results = source.search('app shell');
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(search.pending).toHaveLength(1);
    expect(search.pending[0].url).toBe('/api/search?q=app%20shell');

    // The warm-up is still running; the answer arrives anyway.
    search.pending[0].answer([
      {href: '/components/app-shell', name: 'AppShell'},
    ]);
    expect((await results).map(item => item.label)).toEqual(['AppShell']);
    expect(search.pending).toHaveLength(1);
  });

  it('is sent again when the warm-up answers first, and takes the new answer', async () => {
    const warmup = heldWarmup();
    warmSearch(warmup.fetchWarmup, 1_000);
    const search = heldSearch();
    const source = createCliSearchSource(search.fetchSearch);
    const results = source.search('app shell');
    await new Promise(resolve => setTimeout(resolve, 200));
    expect(search.pending).toHaveLength(1);

    warmup.answer();
    await flush();
    expect(search.pending).toHaveLength(2);
    expect(search.pending[1].url).toBe('/api/search?q=app%20shell');

    search.pending[1].answer([
      {href: '/components/app-shell', name: 'AppShell'},
    ]);
    expect((await results).map(item => item.label)).toEqual(['AppShell']);
    // The request still waiting on the cold server is stopped.
    expect(search.pending[0].signal.aborted).toBe(true);
    expect(search.pending[1].signal.aborted).toBe(false);
  });

  it('sends one request when no warm-up is running', async () => {
    const search = heldSearch();
    const source = createCliSearchSource(search.fetchSearch);
    const results = source.search('button');
    await new Promise(resolve => setTimeout(resolve, 200));
    search.pending[0].answer([{href: '/components/button', name: 'Button'}]);
    expect((await results).map(item => item.label)).toEqual(['Button']);
    expect(search.pending).toHaveLength(1);
  });

  it('stops both requests when a newer query replaces it', async () => {
    const warmup = heldWarmup();
    warmSearch(warmup.fetchWarmup, 1_000);
    const search = heldSearch();
    const source = createCliSearchSource(search.fetchSearch);
    const stale = source.search('app');
    await new Promise(resolve => setTimeout(resolve, 200));
    warmup.answer();
    await flush();
    expect(search.pending).toHaveLength(2);
    source.cancel?.();
    expect(await stale).toEqual([]);
    expect(search.pending.every(request => request.signal.aborted)).toBe(true);
  });
});
