// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Shared adapter for the blog leaves — the ONLY place that touches the
 * network or parses the RSS feed. Both leaves (blog.list, blog.detail) read the
 * blog through here: listing parses the feed; reading a post fetches the
 * plaintext (.txt) alternate the feed advertises for each item. Nothing here
 * touches the blog's source files — the CLI is just a consumer of the public
 * feed, so the blog's structure can change freely without touching the CLI.
 *
 * @input  none (the feed origin is fixed) / a post's plaintext URL
 * @output parsed feed ({feedUrl, posts}) / a post's plaintext body
 * @position api — shared adapter for api/blog/{list,detail}; no envelope shaping here
 */

import {AstryxError} from '../error.mjs';
import {ERROR_CODES} from '../../foundation/response/error-codes.mjs';
import {SITE_URL, SITE_ORIGIN} from './_site.mjs';

/** Abort a feed/post fetch that hangs, and cap how much we'll read. */
const FETCH_TIMEOUT_MS = 15000;
const MAX_BYTES = 5 * 1024 * 1024; // 5 MB — a blog feed is never larger.

/**
 * Canonical RSS feed URL. The feed is always the canonical site — there is no
 * user-supplied URL — so both leaves can hit it directly.
 */
export const FEED_URL = new URL('/rss.xml', SITE_URL).toString();

/** @param {string} url @param {unknown} e @returns {AstryxError} */
function toFetchError(url, e) {
  const reason =
    e instanceof Error
      ? e.name === 'AbortError'
        ? 'timed out'
        : e.message
      : String(e);
  return new AstryxError(
    `Could not reach ${url}: ${reason}`,
    [],
    ERROR_CODES.ERR_FETCH_FAILED,
  );
}

/**
 * Reads a response body as text, stopping as soon as the decoded size
 * exceeds MAX_BYTES instead of buffering the full response first. Falls
 * back to `res.text()` when the runtime/stub doesn't expose a streamable
 * body (buffers fully, but still enforces the cap after the fact).
 * @param {Response} res
 * @param {string} url
 * @returns {Promise<string>}
 */
async function readLimitedText(res, url) {
  if (!res.body) {
    const body = await res.text();
    if (Buffer.byteLength(body, 'utf8') > MAX_BYTES) {
      throw new AstryxError(
        `Response from ${url} exceeded ${MAX_BYTES} bytes`,
        [],
        ERROR_CODES.ERR_FETCH_FAILED,
      );
    }
    return body;
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let received = 0;
  let text = '';
  while (true) {
    const {done, value} = await reader.read();
    if (done) {
      break;
    }
    received += value.byteLength;
    if (received > MAX_BYTES) {
      await reader.cancel();
      throw new AstryxError(
        `Response from ${url} exceeded ${MAX_BYTES} bytes`,
        [],
        ERROR_CODES.ERR_FETCH_FAILED,
      );
    }
    text += decoder.decode(value, {stream: true});
  }
  text += decoder.decode();
  return text;
}

/**
 * @param {string} url
 * @returns {Promise<string>}
 */
async function fetchText(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  // The timer stays active through body consumption (cleared only in
  // `finally`), so a response whose headers arrive promptly but whose body
  // stream stalls is still bounded by FETCH_TIMEOUT_MS, not left pending
  // indefinitely.
  try {
    let res;
    try {
      res = await fetch(url, {
        signal: controller.signal,
        redirect: 'follow',
      });
    } catch (e) {
      throw toFetchError(url, e);
    }
    if (!res.ok) {
      throw new AstryxError(
        `Request to ${url} failed with ${res.status}`,
        [],
        ERROR_CODES.ERR_FETCH_FAILED,
      );
    }
    try {
      return await readLimitedText(res, url);
    } catch (e) {
      if (e instanceof AstryxError) {
        throw e;
      }
      throw toFetchError(url, e);
    }
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Defense in depth: a post's plaintext URL comes from feed content. Require it
 * to live on the canonical origin so even a tampered feed can't redirect the
 * CLI to another host.
 * @param {string} target
 */
function assertCanonicalOrigin(target) {
  let targetOrigin;
  try {
    targetOrigin = new URL(target).origin;
  } catch {
    throw new AstryxError(
      `Post has an invalid plaintext URL: "${target}"`,
      [],
      ERROR_CODES.ERR_FETCH_FAILED,
    );
  }
  if (targetOrigin !== SITE_ORIGIN) {
    throw new AstryxError(
      `Refusing to fetch post text from a non-canonical origin (${targetOrigin})`,
      [],
      ERROR_CODES.ERR_FETCH_FAILED,
    );
  }
}

/**
 * @param {string} value
 * @returns {string}
 */
function unescapeXml(value) {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * @param {string} item
 * @param {string} name
 * @returns {string}
 */
function tag(item, name) {
  const m = item.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`));
  return m ? unescapeXml(m[1].trim()) : '';
}

/**
 * @param {string} item
 * @param {string} name
 * @returns {string[]}
 */
function tagAll(item, name) {
  /** @type {string[]} */
  const out = [];
  const re = new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'g');
  let m;
  while ((m = re.exec(item))) out.push(unescapeXml(m[1].trim()));
  return out;
}

/**
 * Extract the plaintext alternate href from an <item>.
 * @param {string} item
 * @returns {string | null}
 */
function textHref(item) {
  // Match the atom:link alternate regardless of attribute order/quoting; then
  // confirm it's the text/plain alternate before trusting the href.
  const re = /<atom:link\b[^>]*?\/?>/g;
  let m;
  while ((m = re.exec(item))) {
    const el = m[0];
    if (/rel\s*=\s*["']alternate["']/.test(el) &&
        /type\s*=\s*["']text\/plain["']/.test(el)) {
      const href = el.match(/href\s*=\s*["']([^"']+)["']/);
      if (href) return unescapeXml(href[1]);
    }
  }
  return null;
}

/**
 * Derive a slug from a post link (last path segment).
 * @param {string} link
 * @returns {string}
 */
function slugFromLink(link) {
  try {
    const path = new URL(link).pathname.replace(/\/$/, '');
    return path.slice(path.lastIndexOf('/') + 1);
  } catch {
    return link;
  }
}

/**
 * @param {string} xml
 * @returns {import('./blog.type.mjs').BlogPost[]}
 */
function parseFeed(xml) {
  /** @type {import('./blog.type.mjs').BlogPost[]} */
  const items = [];
  const re = /<item>([\s\S]*?)<\/item>/g;
  let m;
  while ((m = re.exec(xml))) {
    const raw = m[1];
    const link = tag(raw, 'link');
    items.push({
      slug: slugFromLink(link),
      title: tag(raw, 'title'),
      description: tag(raw, 'description'),
      date: tag(raw, 'pubDate'),
      type: tag(raw, 'category'),
      authors: tagAll(raw, 'author'),
      link,
      textUrl: textHref(raw),
    });
  }
  return items;
}

/**
 * Fetch the canonical feed and parse it into posts. Shared by both leaves; the
 * envelope's `feedUrl` lets a caller hit the RSS feed directly.
 * @returns {Promise<import('./blog.type.mjs').BlogListData>}
 */
export async function loadFeed() {
  const xml = await fetchText(FEED_URL);
  return {feedUrl: FEED_URL, posts: parseFeed(xml)};
}

/**
 * Fetch a post's plaintext (.txt) alternate, refusing any non-canonical origin
 * so even a tampered feed can't redirect the CLI to another host.
 * @param {string} textUrl
 * @returns {Promise<string>}
 */
export async function fetchPostText(textUrl) {
  assertCanonicalOrigin(textUrl);
  return fetchText(textUrl);
}
