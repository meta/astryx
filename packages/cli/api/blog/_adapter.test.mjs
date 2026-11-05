// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Tests for the blog adapter (api/blog/_adapter.mjs) — the shared network
 * + RSS-parsing layer behind the blog leaves. `fetch` is stubbed so nothing
 * hits the network. Locks the SSRF/origin guard, invalid-URL handling, and the
 * garbage-feed degradation that the leaves depend on but never test directly.
 */

import {describe, it, expect, afterEach, vi} from 'vitest';
import {loadFeed, fetchPostText, FEED_URL} from './_adapter.mjs';
import {AstryxError} from '../error.mjs';
import {SITE_URL} from './_site.mjs';

const FEED = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>Astryx Blog</title>
    <link>${SITE_URL}/blog</link>
    <item>
      <title>Under the hood &amp; more</title>
      <link>${SITE_URL}/blog/how-astryx-works</link>
      <atom:link rel="alternate" type="text/plain" href="${SITE_URL}/blog/how-astryx-works.txt" />
    </item>
  </channel>
</rss>`;

/** Build a fetch stub from a url→{status,body} map. */
function stubFetch(routes) {
  return vi.fn(async url => {
    const r = routes[String(url)];
    if (!r) return {ok: false, status: 404, text: async () => 'not found'};
    return {ok: r.status < 400, status: r.status, text: async () => r.body};
  });
}

/**
 * Build a fetch stub whose response exposes a real streaming `body`
 * (ReadableStream) instead of a `.text()` shortcut, so tests can exercise
 * the adapter's chunked-read path. The stream reacts to the request's
 * AbortSignal the way a real fetch response body does: aborting rejects any
 * pending read with an AbortError, rather than hanging forever.
 *
 * @param {{chunks?: Uint8Array[], staysOpenUntilAbort?: boolean}} options
 * @returns {{fetch: import('vitest').Mock, pulled: {count: number}}}
 */
function stubStreamingFetch({chunks = [], staysOpenUntilAbort = false} = {}) {
  const pulled = {count: 0};
  const fetch = vi.fn(async (_url, requestOptions) => {
    const signal = requestOptions?.signal;
    const stream = new ReadableStream({
      start(controller) {
        signal?.addEventListener('abort', () => {
          controller.error(new DOMException('The operation was aborted', 'AbortError'));
        });
      },
      pull(controller) {
        if (staysOpenUntilAbort) {
          // Never enqueue or close — only the abort listener above settles
          // this stream, simulating a body that stalls after headers arrive.
          return;
        }
        if (pulled.count >= chunks.length) {
          controller.close();
          return;
        }
        controller.enqueue(chunks[pulled.count]);
        pulled.count += 1;
      },
    });
    return {
      ok: true,
      status: 200,
      body: stream,
      text: async () => {
        throw new Error(
          'text() should not be called when a streamable body is available',
        );
      },
    };
  });
  return {fetch, pulled};
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('blog adapter — loadFeed', () => {
  it('parses posts and reports the canonical feed URL', async () => {
    vi.stubGlobal('fetch', stubFetch({[FEED_URL]: {status: 200, body: FEED}}));
    const {feedUrl, posts} = await loadFeed();
    expect(feedUrl).toBe(FEED_URL);
    expect(posts).toHaveLength(1);
    expect(posts[0].slug).toBe('how-astryx-works');
    // XML entities in the title are unescaped.
    expect(posts[0].title).toBe('Under the hood & more');
  });

  it('returns an empty post list for non-RSS / garbage feed content', async () => {
    vi.stubGlobal(
      'fetch',
      stubFetch({[FEED_URL]: {status: 200, body: '<html>not a feed</html>'}}),
    );
    const {feedUrl, posts} = await loadFeed();
    expect(feedUrl).toBe(FEED_URL);
    expect(posts).toEqual([]);
  });

  it('throws ERR_FETCH_FAILED when the feed request is non-200', async () => {
    vi.stubGlobal('fetch', stubFetch({[FEED_URL]: {status: 500, body: 'boom'}}));
    await expect(loadFeed()).rejects.toMatchObject({code: 'ERR_FETCH_FAILED'});
  });
});

describe('blog adapter — fetchPostText SSRF/origin guard', () => {
  it('rejects a plaintext URL on a non-canonical origin (SSRF)', async () => {
    const spy = vi.fn(async () => ({ok: true, status: 200, text: async () => 'SECRETS'}));
    vi.stubGlobal('fetch', spy);
    await expect(
      fetchPostText('http://169.254.169.254/latest/meta-data'),
    ).rejects.toBeInstanceOf(AstryxError);
    await expect(
      fetchPostText('http://169.254.169.254/latest/meta-data'),
    ).rejects.toMatchObject({code: 'ERR_FETCH_FAILED'});
    // The internal host must never be fetched.
    expect(spy).not.toHaveBeenCalled();
  });

  it('rejects an unparseable URL with ERR_FETCH_FAILED', async () => {
    vi.stubGlobal('fetch', vi.fn());
    await expect(fetchPostText('not a url')).rejects.toMatchObject({
      code: 'ERR_FETCH_FAILED',
    });
  });

  it('fetches a same-origin plaintext URL', async () => {
    const url = `${SITE_URL}/blog/how-astryx-works.txt`;
    vi.stubGlobal('fetch', stubFetch({[url]: {status: 200, body: '# body'}}));
    await expect(fetchPostText(url)).resolves.toBe('# body');
  });
});

describe('blog adapter — fetchPostText timeout and size cap (issue #5249)', () => {
  it('keeps the abort timer active through body consumption, so a body that stalls after headers still times out', async () => {
    vi.useFakeTimers();
    try {
      const {fetch} = stubStreamingFetch({staysOpenUntilAbort: true});
      vi.stubGlobal('fetch', fetch);
      const url = `${SITE_URL}/blog/how-astryx-works.txt`;

      const result = fetchPostText(url);
      const assertion = expect(result).rejects.toMatchObject({
        code: 'ERR_FETCH_FAILED',
      });
      // 15s is the adapter's own FETCH_TIMEOUT_MS. If the timer were cleared
      // as soon as headers arrive (the bug), this stalled body would hang
      // forever instead of rejecting once the timer fires.
      await vi.advanceTimersByTimeAsync(15000);
      await assertion;
    } finally {
      vi.useRealTimers();
    }
  });

  it('stops reading once decoded size exceeds the cap, without pulling the rest of the stream', async () => {
    const CHUNK_BYTES = 2 * 1024 * 1024; // 2 MB
    const TOTAL_CHUNKS = 5; // 10 MB total; the adapter's cap is 5 MB.
    const chunk = new Uint8Array(CHUNK_BYTES).fill(97); // 'a'
    const chunks = Array.from({length: TOTAL_CHUNKS}, () => chunk);
    const {fetch, pulled} = stubStreamingFetch({chunks});
    vi.stubGlobal('fetch', fetch);
    const url = `${SITE_URL}/blog/how-astryx-works.txt`;

    await expect(fetchPostText(url)).rejects.toMatchObject({
      code: 'ERR_FETCH_FAILED',
    });
    // 5 MB / 2 MB per chunk needs 3 chunks to cross the cap. Pulling fewer
    // than all 5 proves the read stopped early instead of buffering the
    // full 10 MB body before checking the limit.
    expect(pulled.count).toBeLessThan(TOTAL_CHUNKS);
  });
});
