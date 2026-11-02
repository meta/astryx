// Copyright (c) Meta Platforms, Inc. and affiliates.

// @vitest-environment jsdom

/**
 * @file Search is warmed before the first keystroke, at most once per tab per
 * interval. The API's side is in search-warmup-route.test.ts.
 */

import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {SERVER_WAIT_MS, createCliSearchSource} from '../lib/cliSearchSource';
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
    init: RequestInit;
    answer: (results: {href: string; name: string}[]) => void;
  }[] = [];
  const fetchSearch = vi.fn(
    (url: string, init: RequestInit) =>
      new Promise<Response>(resolve => {
        pending.push({
          url,
          init,
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

const APP_SHELL = [{href: '/components/app-shell', name: 'AppShell'}];
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('one search request at a time', () => {
  beforeEach(() => resetSearchWarmup());

  it('sends a query typed during the warm-up when the warm-up answers', async () => {
    const warmup = heldWarmup();
    warmSearch(warmup.fetchWarmup, 1_000);
    const search = heldSearch();
    const source = createCliSearchSource(search.fetchSearch);
    const results = source.search('app shell');
    await wait(300);
    expect(search.pending).toHaveLength(0);

    warmup.answer();
    await flush();
    expect(search.pending.map(request => request.url)).toEqual([
      '/api/search?q=app%20shell',
    ]);
    search.pending[0].answer(APP_SHELL);
    expect((await results).map(item => item.label)).toEqual(['AppShell']);
  });

  it('sends only the newest query once the request before it answers', async () => {
    const search = heldSearch();
    const source = createCliSearchSource(search.fetchSearch, () => null);
    const app = source.search('app');
    await wait(200);
    expect(search.pending).toHaveLength(1);

    // Typed while "app" is on the server: these wait, and only the newest goes.
    const appS = source.search('app s');
    await wait(200);
    const appShell = source.search('app shell');
    await wait(200);
    expect(search.pending).toHaveLength(1);
    expect(await appS).toEqual([]);

    search.pending[0].answer([{href: '/components/app', name: 'App'}]);
    // A replaced query's answer is never shown.
    expect(await app).toEqual([]);
    await flush();
    expect(search.pending.map(request => request.url)).toEqual([
      '/api/search?q=app',
      '/api/search?q=app%20shell',
    ]);
    search.pending[1].answer(APP_SHELL);
    expect((await appShell).map(item => item.label)).toEqual(['AppShell']);
  });

  it('does not cancel a request already on the server when a query replaces it', async () => {
    const search = heldSearch();
    const source = createCliSearchSource(search.fetchSearch, () => null);
    void source.search('app');
    await wait(200);
    void source.search('app shell');
    expect(search.pending[0].init.signal).toBeUndefined();
  });

  it('sends the query anyway when the request before it never answers', async () => {
    vi.useFakeTimers();
    try {
      warmSearch(heldWarmup().fetchWarmup, 1_000);
      const search = heldSearch();
      const source = createCliSearchSource(search.fetchSearch);
      void source.search('app shell');
      await vi.advanceTimersByTimeAsync(120 + SERVER_WAIT_MS - 10);
      expect(search.pending).toHaveLength(0);
      await vi.advanceTimersByTimeAsync(20);
      expect(search.pending).toHaveLength(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it('sends one request when the server is free', async () => {
    const search = heldSearch();
    const source = createCliSearchSource(search.fetchSearch, () => null);
    const results = source.search('button');
    await wait(200);
    search.pending[0].answer([{href: '/components/button', name: 'Button'}]);
    expect((await results).map(item => item.label)).toEqual(['Button']);
    expect(search.pending).toHaveLength(1);
  });

  it('sends nothing for a query replaced while it waits', async () => {
    const warmup = heldWarmup();
    warmSearch(warmup.fetchWarmup, 1_000);
    const search = heldSearch();
    const source = createCliSearchSource(search.fetchSearch);
    const stale = source.search('app');
    await wait(200);
    source.cancel?.();
    expect(await stale).toEqual([]);
    warmup.answer();
    await flush();
    expect(search.pending).toHaveLength(0);
  });
});
