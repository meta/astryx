// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The images a page names by an https address, fetched once while the
 * page renders, so the file carries them and shows them in a viewer that
 * blocks the network. A fetch sends no cookies or credentials, takes only an
 * image (by its content type and its bytes) up to the size a render carries
 * of one file, and stops at a time limit for each image and one for all of
 * them. Any failure leaves the address as the page wrote it.
 * @position foundation/render — used by render-page.mjs
 */

import {MAX_ASSET_BYTES} from './assets.mjs';

/** How long one image may take, from the request to its last byte. */
export const REMOTE_IMAGE_TIMEOUT_MS = 5000;

/** How long all the images of one render may take together. */
export const REMOTE_IMAGES_BUDGET_MS = 15000;

/** How many images are fetched at once. */
const AT_ONCE = 6;

/**
 * The image type that bytes are, by their leading bytes, or null for any
 * other bytes (a font, a page, a script).
 * @param {Buffer} bytes
 * @returns {string | null}
 */
export function imageTypeOf(bytes) {
  const at = (/** @type {number} */ i, /** @type {string} */ text) =>
    bytes.subarray(i, i + text.length).toString('latin1') === text;
  if (at(0, '\x89PNG\r\n\x1a\n')) return 'image/png';
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)
    return 'image/jpeg';
  if (at(0, 'GIF87a') || at(0, 'GIF89a')) return 'image/gif';
  if (at(0, 'RIFF') && at(8, 'WEBP')) return 'image/webp';
  if (at(4, 'ftypavif') || at(4, 'ftypavis')) return 'image/avif';
  if (at(0, 'BM')) return 'image/bmp';
  if (bytes[0] === 0 && bytes[1] === 0 && bytes[2] === 1 && bytes[3] === 0)
    return 'image/x-icon';
  const head = bytes
    .subarray(0, 4096)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (head.startsWith('<') && /<svg[\s>]/i.test(head)) return 'image/svg+xml';
  return null;
}

/**
 * @typedef {{uri: string} | {reason: string}} RemoteImage
 *   the data: URI the file carries, or why the image was not fetched
 */

/**
 * The remote images of one render. `get` fetches the addresses no earlier
 * call fetched, and `results` holds every answer by the address as the page
 * wrote it.
 * @param {{fetch?: typeof globalThis.fetch, timeoutMs?: number, budgetMs?: number, maxBytes?: number}} [options]
 */
export function remoteImages({
  fetch = globalThis.fetch,
  timeoutMs = REMOTE_IMAGE_TIMEOUT_MS,
  budgetMs = REMOTE_IMAGES_BUDGET_MS,
  maxBytes = MAX_ASSET_BYTES,
} = {}) {
  /** @type {Map<string, RemoteImage>} */
  const results = new Map();
  const budget = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  const tooBig = `larger than ${maxBytes / 1048576} MB, the most a rendered page carries of one file`;
  const late = 'the render ran out of the time it gives remote images';

  /**
   * Why a request failed: its own time limit, the render's, or the network.
   * @param {AbortController} request
   */
  const failure = request =>
    budget.signal.aborted
      ? late
      : request.signal.aborted
        ? `no answer within ${timeoutMs / 1000} s`
        : 'the network could not reach it';

  /**
   * @param {string} url as the page wrote it
   * @returns {Promise<RemoteImage>}
   */
  async function one(url) {
    const address = url.startsWith('//') ? `https:${url}` : url;
    /** @type {URL} */
    let parsed;
    try {
      parsed = new URL(address);
    } catch {
      return {reason: 'not a valid address'};
    }
    if (parsed.protocol !== 'https:') return {reason: 'not an https address'};
    if (parsed.username || parsed.password)
      return {
        reason:
          'the address holds a user name or password, which a render never sends',
      };
    if (budget.signal.aborted) return {reason: late};
    // One request's own time limit, and the render's for every image.
    const request = new AbortController();
    const stopRequest = () => request.abort();
    const limit = setTimeout(stopRequest, timeoutMs);
    budget.signal.addEventListener('abort', stopRequest, {once: true});
    try {
      return await read(parsed, request);
    } finally {
      clearTimeout(limit);
      budget.signal.removeEventListener('abort', stopRequest);
    }
  }

  /**
   * @param {URL} parsed
   * @param {AbortController} request
   * @returns {Promise<RemoteImage>}
   */
  async function read(parsed, request) {
    /** @type {Response} */
    let response;
    try {
      response = await fetch(parsed.href, {
        credentials: 'omit',
        redirect: 'follow',
        referrerPolicy: 'no-referrer',
        headers: {accept: 'image/*'},
        signal: request.signal,
      });
    } catch {
      return {reason: failure(request)};
    }
    const stop = () => response.body?.cancel().catch(() => {});
    if (!response.ok) {
      stop();
      return {reason: `the server answered ${response.status}`};
    }
    if (response.url && !response.url.startsWith('https:')) {
      stop();
      return {reason: 'it moved to an address that is not https'};
    }
    const type = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!type.startsWith('image/')) {
      stop();
      return {reason: 'not an image'};
    }
    if (Number(response.headers.get('content-length')) > maxBytes) {
      stop();
      return {reason: tooBig};
    }
    /** @type {Buffer[]} */
    const chunks = [];
    let size = 0;
    try {
      for await (const chunk of /** @type {any} */ (response.body ?? [])) {
        size += chunk.length;
        if (size > maxBytes) {
          stop();
          return {reason: tooBig};
        }
        chunks.push(Buffer.from(chunk));
      }
    } catch {
      return {reason: failure(request)};
    }
    const bytes = Buffer.concat(chunks);
    const image = imageTypeOf(bytes);
    if (!image) return {reason: 'not an image'};
    return {uri: `data:${image};base64,${bytes.toString('base64')}`};
  }

  return {
    results,
    /**
     * Fetch each address no earlier call fetched, a few at a time.
     * @param {Iterable<string>} urls as the page wrote them
     */
    async get(urls) {
      const wanted = [...new Set(urls)].filter(url => !results.has(url));
      if (wanted.length === 0) return;
      if (timer === null) {
        timer = setTimeout(() => budget.abort(), budgetMs);
        timer.unref?.();
      }
      let next = 0;
      const worker = async () => {
        while (next < wanted.length) {
          const url = wanted[next++];
          results.set(url, await one(url));
        }
      };
      await Promise.all(
        Array.from({length: Math.min(AT_ONCE, wanted.length)}, worker),
      );
    },
    /** Stop the render's time limit. */
    done() {
      if (timer !== null) clearTimeout(timer);
    },
    /**
     * Every address fetched, and every one that was not, with why.
     * @returns {{fetched: string[], failed: {url: string, reason: string}[]}}
     */
    summary() {
      /** @type {string[]} */
      const fetched = [];
      /** @type {{url: string, reason: string}[]} */
      const failed = [];
      for (const [url, result] of results) {
        if ('uri' in result) fetched.push(url);
        else failed.push({url, reason: result.reason});
      }
      return {fetched, failed};
    },
  };
}
