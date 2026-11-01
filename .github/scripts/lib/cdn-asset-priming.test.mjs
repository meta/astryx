// Copyright (c) Meta Platforms, Inc. and affiliates.

import {describe, expect, it, vi} from 'vitest';
import {pageAssetUrls, primeCdnAssets} from './cdn-asset-priming.mjs';

const PAGE = `
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/src/reset.css" />
  <link rel="stylesheet" href="/local.css" />
  <script src="https://esm.sh/@astryxdesign/core@0.7.2" type="module"></script>
  <script type="importmap">
    {"imports": {
      "react": "https://esm.sh/react@19.2.0",
      "core": "https://esm.sh/@astryxdesign/core@0.7.2?external=react,react-dom",
      "local": "./local.js"
    }}
  </script>
  <p>Docs: https://astryx.dev/docs/button</p>
`;

describe('pageAssetUrls', () => {
  it('collects what the page fetches, in document order', () => {
    expect(pageAssetUrls(PAGE)).toEqual([
      'https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/src/reset.css',
      'https://esm.sh/@astryxdesign/core@0.7.2',
      'https://esm.sh/react@19.2.0',
      'https://esm.sh/@astryxdesign/core@0.7.2?external=react,react-dom',
    ]);
  });

  it('leaves out preconnect hints, relative paths and links in prose', () => {
    const urls = pageAssetUrls(PAGE);
    expect(urls).not.toContain('https://fonts.googleapis.com');
    expect(urls).not.toContain('https://fonts.gstatic.com');
    expect(urls).not.toContain('https://astryx.dev/docs/button');
    expect(urls).not.toContain('./local.js');
  });

  it('names a URL once when the page asks for it twice', () => {
    const resetCss =
      'https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/src/reset.css';
    const twice = `${PAGE}\n<link rel="stylesheet" href="${resetCss}" />`;
    expect(pageAssetUrls(twice).filter(u => u === resetCss)).toHaveLength(1);
    expect(pageAssetUrls(twice)).toHaveLength(pageAssetUrls(PAGE).length);
  });

  it('survives an import map that is not JSON', () => {
    const broken = PAGE.replace(/"imports": \{[\s\S]*?\}\}/, 'not json');
    expect(() => pageAssetUrls(broken)).not.toThrow();
    expect(pageAssetUrls(broken)).toContain(
      'https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/src/reset.css',
    );
  });

  it('collects a scoped import-map target, not only the top-level ones', () => {
    const scoped = `
      <script type="importmap">
        {"imports": {"react": "https://esm.sh/react@19.2.0"},
         "scopes": {"./app/": {"react": "https://esm.sh/react@18.3.1",
                               "lodash": "https://esm.sh/lodash@4.17.21"}}}
      </script>
    `;
    const urls = pageAssetUrls(scoped);
    expect(urls).toContain('https://esm.sh/react@19.2.0');
    expect(urls).toContain('https://esm.sh/react@18.3.1');
    expect(urls).toContain('https://esm.sh/lodash@4.17.21');
    // A scope prefix is a key, never a value, and must not displace the
    // top-level entry that happens to share its specifier name.
    expect(urls).not.toContain('./app/');
  });

  it('tolerates a scope whose map is missing or malformed', () => {
    expect(
      pageAssetUrls(
        '<script type="importmap">{"scopes": {"./a/": null, "./b/": {"x": 42}}}</script>',
      ),
    ).toEqual([]);
  });

  it('primes only the links a page load actually fetches', () => {
    const page = `
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/dist/astryx.css" />
      <link rel="modulepreload" href="https://esm.sh/react@19.2.0" />
      <link rel="preload" as="script" href="https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.js" />
      <link rel="preload stylesheet" as="style" href="https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/dist/theme.css" />
      <link rel="icon" href="https://astryx.dev/favicon.ico" />
      <link rel="manifest" href="https://astryx.dev/site.webmanifest" />
      <link rel="canonical" href="https://astryx.dev/docs/button" />
      <link rel="prefetch" href="https://astryx.dev/docs/input" />
    `;
    const urls = pageAssetUrls(page);
    expect(urls).toEqual([
      'https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/dist/astryx.css',
      'https://esm.sh/react@19.2.0',
      // A bare `rel="preload"` is fetched during the load like any other asset,
      // and a multi-token `rel` matches on any load-time token it carries.
      'https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.js',
      'https://cdn.jsdelivr.net/npm/@astryxdesign/core@0.7.2/dist/theme.css',
    ]);
    // A 404 on any of these is not a broken starter page: the page never asks
    // for them while it loads.
    expect(urls).not.toContain('https://astryx.dev/favicon.ico');
    expect(urls).not.toContain('https://astryx.dev/site.webmanifest');
    expect(urls).not.toContain('https://astryx.dev/docs/button');
    expect(urls).not.toContain('https://astryx.dev/docs/input');
  });
});

/**
 * A fetch that answers from a script, one entry per call, and keeps answering
 * with its last entry afterwards. `calls` records which URL each answer went to.
 * A number answers with a bare status — no body to read, the way a stubbed
 * transport behaves — and `{status, …}` answers with whatever the response
 * object is given.
 */
function scriptedFetch(results) {
  const calls = [];
  return {
    calls,
    fetchImpl: async url => {
      calls.push(url);
      const result = results[Math.min(calls.length - 1, results.length - 1)];
      if (result instanceof Error) throw result;
      return typeof result === 'number' ? {status: result} : result;
    },
  };
}

/** A response whose body is text, as both CDNs serve an error document. */
function textResponse(status, body) {
  return {status, text: async () => body};
}

/**
 * A streamed body, chunked and watched, so a test can see how far the probe read
 * and whether it gave the rest of the document back.
 */
function streamBody(text, chunkSize = 24) {
  const encoder = new TextEncoder();
  const chunks = [];
  for (let i = 0; i < text.length; i += chunkSize) {
    chunks.push(encoder.encode(text.slice(i, i + chunkSize)));
  }
  let reads = 0;
  const state = {reads: () => reads, cancelled: false};
  return {
    state,
    getReader() {
      return {
        async read() {
          const chunk = chunks[reads];
          reads += 1;
          return chunk === undefined
            ? {done: true, value: undefined}
            : {done: false, value: chunk};
        },
        async cancel() {
          state.cancelled = true;
        },
      };
    },
  };
}

describe('primeCdnAssets', () => {
  it('returns every asset as ready when the CDN already serves it', async () => {
    const {calls, fetchImpl} = scriptedFetch([200]);
    const sleep = vi.fn();
    const res = await primeCdnAssets(['a.css', 'b.css'], {
      fetchImpl,
      sleep,
      now: () => 0,
      deadlineMs: 1_000,
    });
    expect(res).toEqual({ready: ['a.css', 'b.css'], cold: []});
    expect(calls).toEqual(['a.css', 'b.css']);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('retries only what did not serve, and reports it once it does', async () => {
    const {calls, fetchImpl} = scriptedFetch([404, 200, 200]);
    const sleep = vi.fn();
    const res = await primeCdnAssets(['building.css', 'served.css'], {
      fetchImpl,
      sleep,
      now: () => 0,
      deadlineMs: 1_000,
    });
    expect(calls).toEqual(['building.css', 'served.css', 'building.css']);
    expect(res.cold).toEqual([]);
    expect(res.ready.sort()).toEqual(['building.css', 'served.css']);
    expect(sleep).toHaveBeenCalledOnce();
  });

  it('reports an asset the CDN never serves, with the answer it gave', async () => {
    const {calls, fetchImpl} = scriptedFetch([404]);
    const res = await primeCdnAssets(['still-building.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(calls).toEqual(['still-building.css']);
    expect(res.ready).toEqual([]);
    expect(res.cold).toEqual([{url: 'still-building.css', reason: 'HTTP 404'}]);
  });

  it('names a request that fails outright rather than answering', async () => {
    const timeout = new Error('The operation was aborted due to timeout');
    timeout.name = 'TimeoutError';
    const {fetchImpl} = scriptedFetch([timeout]);
    const res = await primeCdnAssets(['hanging.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold).toEqual([{url: 'hanging.css', reason: 'TimeoutError'}]);
  });

  it('carries a socket-level cause into the reason, not just the wrapper name', async () => {
    // undici reports every transport failure as `TypeError: fetch failed` and
    // puts the real code on error.cause — without it every network problem
    // reads as the same one word.
    const wrapped = new TypeError('fetch failed');
    wrapped.cause = Object.assign(new Error('connect ETIMEDOUT'), {
      code: 'UND_ERR_CONNECT_TIMEOUT',
    });
    const {fetchImpl} = scriptedFetch([wrapped]);
    const res = await primeCdnAssets(['unreachable.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold).toEqual([
      {
        url: 'unreachable.css',
        reason: 'TypeError (UND_ERR_CONNECT_TIMEOUT)',
      },
    ]);
  });

  it('treats a redirect as served and a server error as not', async () => {
    const {fetchImpl} = scriptedFetch([302, 500]);
    const res = await primeCdnAssets(['redirected.js', 'broken.js'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.ready).toEqual(['redirected.js']);
    expect(res.cold).toEqual([{url: 'broken.js', reason: 'HTTP 500'}]);
  });

  it('stops retrying once the deadline is spent', async () => {
    const {calls, fetchImpl} = scriptedFetch([404]);
    let elapsed = 0;
    const res = await primeCdnAssets(['a.css', 'b.css'], {
      fetchImpl,
      sleep: async () => {
        elapsed += 5_000;
      },
      now: () => elapsed,
      deadlineMs: 5_000,
    });
    expect(calls).toEqual(['a.css', 'b.css', 'a.css', 'b.css']);
    expect(res.cold.map(entry => entry.url)).toEqual(['a.css', 'b.css']);
  });

  it('deduplicates a URL the page names twice', async () => {
    const {calls, fetchImpl} = scriptedFetch([200]);
    const res = await primeCdnAssets(['same.css', 'same.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 1_000,
    });
    expect(calls).toEqual(['same.css']);
    expect(res.ready).toEqual(['same.css']);
  });

  it('names a cause that has a message but no code', async () => {
    // Measured on Node 24: `fetch('http://127.0.0.1:1/a.css')` rejects with a
    // `TypeError: fetch failed` whose cause is a bare `Error: bad port`, with no
    // `code` anywhere, so a code-only label printed the wrapper name alone.
    const wrapped = new TypeError('fetch failed');
    wrapped.cause = new Error('bad port');
    const {fetchImpl} = scriptedFetch([wrapped]);
    const res = await primeCdnAssets(['bad-port.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold).toEqual([
      {url: 'bad-port.css', reason: 'TypeError (bad port)'},
    ]);
  });

  it('carries the CDN sentence for a missing version into the reason', async () => {
    // Verbatim from jsDelivr: `curl https://cdn.jsdelivr.net/npm/
    // @astryxdesign/core@9.9.9/package.json` answers text/plain with this.
    const {fetchImpl} = scriptedFetch([
      textResponse(404, "Couldn't find the requested release version 9.9.9.\n"),
    ]);
    const res = await primeCdnAssets(['core.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold).toEqual([
      {
        url: 'core.css',
        reason: "HTTP 404 — Couldn't find the requested release version 9.9.9.",
      },
    ]);
  });

  it('separates the refusals that all answer 404', async () => {
    // Three real answers, each measured against the live CDN, and the status
    // alone reported all three as the same `HTTP 404`. A contributor has to be
    // able to tell them apart: only one of them is a file this repo broke.
    const {fetchImpl} = scriptedFetch([
      textResponse(
        404,
        "Couldn't find the requested file /dist/nope.css in @astryxdesign/core.\n",
      ),
      textResponse(
        404,
        'Failed to fetch version info for @astryxdesign/no-such-zz.\n',
      ),
      // esm.sh words a missing release differently again.
      textResponse(404, "version 9.9.9 of 'react' not found\n"),
    ]);
    const res = await primeCdnAssets(
      ['bad-path.css', 'bad-package.js', 'bad-version.js'],
      {
        fetchImpl,
        sleep: async () => {},
        now: () => 0,
        deadlineMs: 0,
      },
    );
    expect(Object.fromEntries(res.cold.map(e => [e.url, e.reason]))).toEqual({
      'bad-path.css':
        "HTTP 404 — Couldn't find the requested file /dist/nope.css in @astryxdesign/core.",
      'bad-package.js':
        'HTTP 404 — Failed to fetch version info for @astryxdesign/no-such-zz.',
      'bad-version.js': "HTTP 404 — version 9.9.9 of 'react' not found",
    });
  });

  it('reads a streamed body and gives the rest of the document back', async () => {
    const body = streamBody('Sorry, the requested resource does not exist.');
    const {fetchImpl} = scriptedFetch([{status: 404, body}]);
    const res = await primeCdnAssets(['a.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold[0].reason).toBe(
      'HTTP 404 — Sorry, the requested resource does not exist.',
    );
    // An abandoned body holds the connection, and the next round would pay for it.
    expect(body.state.cancelled).toBe(true);
  });

  it('bounds the read of a document that is not an error message', async () => {
    const body = streamBody('<!doctype html><html><body>' + 'x'.repeat(9_000));
    const {fetchImpl} = scriptedFetch([{status: 500, body}]);
    const res = await primeCdnAssets(['a.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold[0].reason.length).toBeLessThan(440);
    // Stops at the cap instead of draining 9 KB it will never print.
    expect(body.state.reads()).toBeLessThan(20);
    expect(body.state.cancelled).toBe(true);
  });

  it('bounds the summary when the document arrived in one piece', async () => {
    // The streamed read bounds itself where it reads; a response that only
    // offers `text()` has no such place, so the printed line is what gets cut.
    const {fetchImpl} = scriptedFetch([textResponse(500, 'x'.repeat(9_000))]);
    const res = await primeCdnAssets(['a.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold[0].reason).toMatch(/^HTTP 500 — x{399}…$/);
    expect(res.cold[0].reason.length).toBeLessThan(420);
  });

  it('reports the first readable line of an HTML error page', async () => {
    const {fetchImpl} = scriptedFetch([
      textResponse(
        404,
        '<html>\n  <body>\n    <h1>Not Found</h1>\n    <p>No package by that name.</p>\n  </body>\n</html>\n',
      ),
    ]);
    const res = await primeCdnAssets(['a.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold[0].reason).toBe('HTTP 404 — Not Found');
  });

  it('skips a blank leading line to reach the message', async () => {
    const {fetchImpl} = scriptedFetch([
      textResponse(
        404,
        '\n\n  Package @astryxdesign/core@9.9.9 is still being built.\n  Try again shortly.\n',
      ),
    ]);
    const res = await primeCdnAssets(['a.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold[0].reason).toBe(
      'HTTP 404 — Package @astryxdesign/core@9.9.9 is still being built.',
    );
  });

  it('reports the status alone when the body says nothing readable', async () => {
    const {fetchImpl} = scriptedFetch([
      textResponse(404, ''),
      textResponse(404, '\n   \n  \n'),
      textResponse(404, '<div></div>'),
    ]);
    const res = await primeCdnAssets(['a.css', 'b.css', 'c.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(res.cold.map(entry => entry.reason)).toEqual([
      'HTTP 404',
      'HTTP 404',
      'HTTP 404',
    ]);
  });

  it('keeps the status when the body will not read', async () => {
    // A transport that answers the headers and then drops the body must still
    // report the answer, not the read failure that came after it.
    const {fetchImpl} = scriptedFetch([
      {
        status: 404,
        text: async () => {
          throw new TypeError('terminated');
        },
      },
      {
        status: 503,
        body: {
          getReader() {
            return {
              read: async () => {
                throw new Error('stream reset');
              },
              cancel: async () => {},
            };
          },
        },
      },
    ]);
    const res = await primeCdnAssets(['dropped.css', 'reset.css'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
    expect(Object.fromEntries(res.cold.map(e => [e.url, e.reason]))).toEqual({
      'dropped.css': 'HTTP 404',
      'reset.css': 'HTTP 503',
    });
  });

  it('does not read the body of an asset that serves', async () => {
    let textReads = 0;
    const {fetchImpl} = scriptedFetch([
      {status: 200, text: async () => ((textReads += 1), 'asset bytes')},
      {status: 302, text: async () => ((textReads += 1), 'redirecting')},
    ]);
    const res = await primeCdnAssets(['a.css', 'b.js'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 1_000,
    });
    expect(res.ready.sort()).toEqual(['a.css', 'b.js']);
    expect(res.cold).toEqual([]);
    expect(textReads).toBe(0);
  });
});

// The smoke test prints each cold asset as `<url> :: <reason>` under a legend
// that explains the three shapes a reason can take
// (`.github/scripts/cdn-template-smoke-test.mjs`, the `fail(...)` call after
// `primeCdnAssets`). The legend is only true while `primeCdnAssets` produces
// exactly those shapes, so the promise is pinned here rather than left to a
// reader who cannot tell a status from a socket error.
describe('the shapes the smoke test legend describes', () => {
  const probe = results => {
    const {fetchImpl} = scriptedFetch(results);
    return primeCdnAssets(['a', 'b', 'c'], {
      fetchImpl,
      sleep: async () => {},
      now: () => 0,
      deadlineMs: 0,
    });
  };

  it('answers every asset with one of the three shapes', async () => {
    const {cold} = await probe([
      textResponse(404, "Couldn't find the requested release version 9.9.9.\n"),
      textResponse(500, ''),
      new Error('boom'),
    ]);
    // Keyed by URL, because the assets settle in whatever order they fail.
    expect(Object.fromEntries(cold.map(e => [e.url, e.reason]))).toEqual({
      // 1. status + the CDN's own sentence
      a: "HTTP 404 — Couldn't find the requested release version 9.9.9.",
      // 2. status alone
      b: 'HTTP 500',
      // 3. a bare error name
      c: 'Error',
    });
  });

  it('keeps the shapes distinguishable from each other', () => {
    // What the legend asserts, stated as the test: a status means the CDN
    // answered, a sentence after it names the thing it could not find, and the
    // absence of a status means no answer arrived at all.
    const withSentence =
      "HTTP 404 — Couldn't find the requested release version 9.9.9.";
    const statusOnly = 'HTTP 500';
    const noAnswer = 'TypeError (UND_ERR_CONNECT_TIMEOUT)';
    for (const answered of [withSentence, statusOnly]) {
      expect(answered).toMatch(/^HTTP \d{3}( — .+)?$/);
    }
    expect(noAnswer).not.toMatch(/^HTTP /);
    expect(withSentence.split(' — ')[1].length).toBeGreaterThan(0);
    expect(statusOnly).not.toContain(' — ');
  });
});
