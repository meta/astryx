// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * Prime the CDN assets a starter page asks for, before a browser does.
 *
 * Both CDNs the starter page uses build a package on the first request that
 * reaches them for it, and a request that arrives while that build is running is
 * answered with an error document. For CSS that is the worst case: Chromium
 * refuses a stylesheet served as `text/plain` (`net::ERR_BLOCKED_BY_ORB`), the
 * page never goes idle, and a smoke test that launches a browser sees only a
 * navigation timeout — minutes later, on a lane every contributor's pull
 * request runs, with nothing in the output naming the cause.
 *
 * A plain `fetch` starts the same build and keeps polling it, so the page's own
 * asset URLs are requested here first, and the ones that still do not serve are
 * reported by URL with what the CDN answered — a status alone cannot tell an
 * unbuilt version apart from a path that does not exist in it.
 */

/** True for an answer that means the asset is there: 2xx, or a redirect to it. */
function isServable(status) {
  return status >= 200 && status < 400;
}

/** Absolute http(s) URLs only; a relative or protocol-relative link is not ours to prime. */
function isAbsoluteHttp(value) {
  return /^https?:\/\//i.test(value ?? '');
}

/**
 * `rel` is a set of space-separated tokens, and the ones that make the browser
 * fetch a file while loading the page are these. Everything else a `<link>` can
 * carry — `icon`, `manifest`, `canonical`, `prefetch`, `preconnect` — names a
 * resource the page load does not request, so priming it would report a
 * perfectly good starter page as broken over a file nobody asked for.
 */
const LOAD_TIME_RELS = new Set(['stylesheet', 'modulepreload', 'preload']);

/**
 * Every URL the page itself fetches, in document order and deduplicated.
 *
 * Only load-time requests: `stylesheet`/`modulepreload`/`preload` links, script
 * `src`s, and the import map's module entries — both the top-level `imports` and
 * the targets nested under `scopes`.
 *
 * @param {string} html the scaffolded page
 * @returns {string[]}
 */
export function pageAssetUrls(html) {
  const urls = [];

  for (const tag of html.match(/<link\b[^>]*>/gi) ?? []) {
    const rel = /\brel="([^"]*)"/i.exec(tag)?.[1] ?? '';
    if (!rel.split(/\s+/).some(token => LOAD_TIME_RELS.has(token))) continue;
    const href = /\bhref="([^"]*)"/i.exec(tag)?.[1];
    if (isAbsoluteHttp(href)) urls.push(href);
  }

  for (const tag of html.match(/<script\b[^>]*\bsrc="[^"]*"[^>]*>/gi) ?? []) {
    const src = /\bsrc="([^"]*)"/i.exec(tag)?.[1];
    if (isAbsoluteHttp(src)) urls.push(src);
  }

  for (const block of html.match(
    /<script\b[^>]*type="importmap"[^>]*>([\s\S]*?)<\/script>/gi,
  ) ?? []) {
    const json = />([\s\S]*?)<\/script>/i.exec(block)?.[1];
    let map;
    try {
      map = JSON.parse(json ?? '');
    } catch {
      // The browser will report a malformed import map far better than this
      // probe can, and priming is only a precondition for that report.
      continue;
    }
    // `scopes` maps each scope prefix to its own specifier→URL object, so its
    // values are objects rather than URLs: flatten that one level to reach the
    // targets. Spreading it beside `imports` collected nothing and let a scope
    // prefix silently overwrite an equally named top-level specifier.
    const targets = [
      ...Object.values(map?.imports ?? {}),
      ...Object.values(map?.scopes ?? {}).flatMap(scope =>
        Object.values(scope ?? {}),
      ),
    ];
    for (const target of targets) {
      if (isAbsoluteHttp(target)) urls.push(target);
    }
  }

  return [...new Set(urls)];
}

/**
 * What a failed request actually was. `undici` reports every transport failure
 * as `TypeError: fetch failed` and puts the real reason one level down on
 * `error.cause` — as a `code` (`UND_ERR_CONNECT_TIMEOUT`, `ECONNREFUSED`,
 * `ENOTFOUND`, …) or, when the request never reached a socket, as a message like
 * `bad port`. The wrapper name alone sends a contributor to a generic error.
 *
 * @param {unknown} error
 * @returns {string}
 */
function requestFailureLabel(error) {
  const name = error instanceof Error ? error.name : String(error);
  const cause = error?.cause;
  if (!cause) return name;
  const detail = cause.code ?? cause.message;
  return detail ? `${name} (${String(detail).trim()})` : name;
}

/**
 * How far into an error document the probe reads. A CDN refusal is one short
 * sentence, so this is well past what it says, while still bounding what a
 * server that answers with a full page can cost a failing asset check.
 */
const ERROR_BODY_MAX_CHARS = 400;

/**
 * The shape `primeCdnAssets` reads out of whatever answered its request.
 *
 * @typedef {{status: number, body?: unknown, text?: () => Promise<string>}} ResponseLike
 */

/**
 * The start of an error document, read without pulling the whole body.
 *
 * @param {ResponseLike} response
 * @returns {Promise<string|null>} null when it carries nothing readable
 */
async function readErrorBody(response) {
  const stream = response?.body;
  if (typeof stream?.getReader !== 'function') {
    return typeof response?.text === 'function' ? await response.text() : null;
  }
  const reader = stream.getReader();
  const decoder = new TextDecoder();
  let text = '';
  try {
    while (text.length < ERROR_BODY_MAX_CHARS) {
      const {done, value} = await reader.read();
      if (done) break;
      text += decoder.decode(value, {stream: true});
    }
  } finally {
    // Nothing wants the rest of the document, and an abandoned body keeps the
    // connection open past the round that read it.
    await reader.cancel().catch(() => {});
  }
  return text;
}

/**
 * What the CDN said, as one line: markup removed, whitespace collapsed, the
 * first remaining line kept and bounded.
 *
 * @param {string|null} body
 * @returns {string|null} null when the document says nothing readable
 */
function describeErrorBody(body) {
  if (!body) return null;
  const withoutMarkup = body
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<[^>]*>/g, ' ');
  for (const line of withoutMarkup.split(/\r?\n/)) {
    const summary = line.replace(/\s+/g, ' ').trim();
    if (summary === '') continue;
    return summary.length > ERROR_BODY_MAX_CHARS
      ? `${summary.slice(0, ERROR_BODY_MAX_CHARS - 1).trimEnd()}…`
      : summary;
  }
  return null;
}

/**
 * Why an answered request still did not serve the asset.
 *
 * Every refusal these CDNs make is a `404` with a sentence that names the thing
 * it could not find, so the status on its own reports three different failures
 * as one string. The document is a bonus on top of the status though: a body
 * that will not read must never cost the report of the status that did answer.
 *
 * @param {ResponseLike} response
 * @returns {Promise<string>}
 */
async function nonServableReason(response) {
  const status = `HTTP ${response?.status}`;
  let said;
  try {
    said = describeErrorBody(await readErrorBody(response));
  } catch {
    return status;
  }
  return said === null ? status : `${status} — ${said}`;
}

/**
 * Request each URL until it serves, sharing one deadline across all of them.
 *
 * The first round asks for everything once, which is what starts a cold build;
 * only URLs that did not serve are asked again, so a page whose assets are
 * already cached costs one round trip per asset.
 *
 * @param {string[]} urls
 * @param {object} [options]
 * @param {(url: string, init: object) => Promise<ResponseLike>} [options.fetchImpl]
 * @param {number} [options.deadlineMs] total budget for every retry round
 * @param {number} [options.retryDelayMs] pause between rounds
 * @param {number} [options.probeTimeoutMs] per-request timeout, so a hanging CDN cannot spend the budget
 * @param {() => number} [options.now]
 * @param {(ms: number) => Promise<void>} [options.sleep]
 * @returns {Promise<{ready: string[], cold: Array<{url: string, reason: string}>}>}
 */
export async function primeCdnAssets(
  urls,
  {
    fetchImpl = globalThis.fetch,
    deadlineMs = 120_000,
    retryDelayMs = 5_000,
    probeTimeoutMs = 10_000,
    now = Date.now,
    sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  } = {},
) {
  const ready = new Set();
  const reasons = new Map();
  let pending = [...new Set(urls)];
  const deadline = now() + deadlineMs;

  while (pending.length > 0) {
    const stillPending = [];
    await Promise.all(
      pending.map(async url => {
        let reason;
        try {
          const response = await fetchImpl(url, {
            redirect: 'follow',
            signal: AbortSignal.timeout(probeTimeoutMs),
          });
          reason = isServable(response.status)
            ? null
            : await nonServableReason(response);
        } catch (error) {
          reason = requestFailureLabel(error);
        }
        if (reason === null) {
          ready.add(url);
        } else {
          reasons.set(url, reason);
          stillPending.push(url);
        }
      }),
    );
    pending = stillPending;
    if (pending.length === 0) break;
    if (now() >= deadline) break;
    await sleep(retryDelayMs);
  }

  return {
    ready: [...ready],
    cold: pending.map(url => ({url, reason: reasons.get(url) ?? 'unknown'})),
  };
}
