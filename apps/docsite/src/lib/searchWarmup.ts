// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Gets the site's search ready before the first keystroke.
 * @input A moment the reader may be about to search: the page went idle after
 *   loading, the pointer or focus reached the Search button, or the palette
 *   opened.
 * @output At most one warm-up request to the search API (app/api/search) per
 *   tab every few minutes, and while it runs, a promise that settles when it
 *   answers (runningSearchWarmup).
 * @position Called by SharedTopNav.tsx.
 *
 * The site's search runs the CLI's `search()` on the server (spec:AST-033
 * DEC-8). A server that has not answered for a while starts cold: it loads the
 * CLI and gathers its catalog, which takes seconds, and the reader's first
 * query used to wait for all of it. A warm-up request does that work while the
 * reader is still reading or reaching for Search, so their first query only
 * ranks. Warm-ups are throttled per tab (sessionStorage survives reloads and
 * client navigation) so hovering or reopening Search never sends a request
 * each time.
 *
 * While the warm-up runs, its server is starting and cannot take requests, so
 * the host would start another cold server for a query sent then. The search
 * source (lib/cliSearchSource.ts) holds a query until the running warm-up
 * answers (runningSearchWarmup), and keeps one request at a time after that.
 */

/** The request that loads the search server without running a query. */
export const SEARCH_WARMUP_URL = '/api/search?warm=1';

/**
 * How long a warm-up keeps counting: shorter than the time an idle server is
 * kept, so a reader who comes back to Search later warms it again.
 */
export const SEARCH_WARMUP_INTERVAL_MS = 4 * 60 * 1000;

const STORAGE_KEY = 'astryx-docsite:search-warmed-at';

/** The last warm-up in this tab when sessionStorage is unavailable. */
let lastWarmedAt = Number.NEGATIVE_INFINITY;

/** The warm-up this page sent, until it answers. */
let running: Promise<void> | null = null;

function readWarmedAt(): number {
  try {
    const stored = window.sessionStorage.getItem(STORAGE_KEY);
    if (stored != null) {
      const at = Number(stored);
      if (Number.isFinite(at)) {
        return Math.max(at, lastWarmedAt);
      }
    }
  } catch {
    // Storage can be denied; the in-memory time still throttles this page.
  }
  return lastWarmedAt;
}

function writeWarmedAt(at: number): void {
  lastWarmedAt = at;
  try {
    window.sessionStorage.setItem(STORAGE_KEY, String(at));
  } catch {
    // See readWarmedAt.
  }
}

/**
 * Send one warm-up request unless this tab sent one in the last
 * SEARCH_WARMUP_INTERVAL_MS. Never throws, and never waits for the answer.
 * @returns Whether a request was sent.
 */
export function warmSearch(
  fetchWarmup: (url: string, init: RequestInit) => Promise<unknown> = (
    url,
    init,
  ) => fetch(url, init),
  now: number = Date.now(),
): boolean {
  if (now - readWarmedAt() < SEARCH_WARMUP_INTERVAL_MS) {
    return false;
  }
  writeWarmedAt(now);
  let request: Promise<unknown>;
  try {
    request = fetchWarmup(SEARCH_WARMUP_URL, {cache: 'no-store'});
  } catch {
    // A failed warm-up only means the first query starts the server itself.
    return true;
  }
  const settled: Promise<void> = Promise.resolve(request).then(
    () => {},
    () => {},
  );
  running = settled;
  settled.then(() => {
    if (running === settled) {
      running = null;
    }
  });
  return true;
}

/** The warm-up this page sent, until it answers (never rejects); otherwise null. */
export function runningSearchWarmup(): Promise<void> | null {
  return running;
}

/** Forget the last warm-up. For tests. */
export function resetSearchWarmup(): void {
  lastWarmedAt = Number.NEGATIVE_INFINITY;
  running = null;
  try {
    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // See readWarmedAt.
  }
}

/**
 * Run `task` once the page is idle after loading, or after `fallbackMs` where
 * the browser has no idle callback. Returns a cancel function.
 */
export function whenIdle(task: () => void, fallbackMs = 2000): () => void {
  if (typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(task, {timeout: fallbackMs * 2});
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(task, fallbackMs);
  return () => window.clearTimeout(handle);
}
