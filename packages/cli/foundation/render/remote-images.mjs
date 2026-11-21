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

import * as https from 'node:https';
import {MAX_ASSET_BYTES, imageTypeOf} from './assets.mjs';

export {imageTypeOf};

/** How long one image may take, from the request to its last byte. */
export const REMOTE_IMAGE_TIMEOUT_MS = 5000;

/**
 * How long a request may wait for its first answer. A request with no answer
 * by then most often never gets one: the machine has no network, or the
 * name does not resolve.
 */
export const REMOTE_IMAGE_ANSWER_MS = 2000;

/** How long all the images of one render may take together. */
export const REMOTE_IMAGES_BUDGET_MS = 15000;

/** How many images are fetched at once. */
const AT_ONCE = 6;

/** How many redirects a request follows. */
const MOST_REDIRECTS = 5;

/**
 * A GET of `href` through Node's own client, answered as much of a fetch
 * `Response` as the reader needs. A request the render stops closes its
 * socket at once: a stopped fetch whose connect is still going keeps the
 * process alive until the system gives up on the address. It sends no
 * cookies, credentials or referrer, keeps no connection open, and follows a
 * redirect only to an address of the same scheme that holds no user name or
 * password (the client would send those as an Authorization header).
 * @param {string} href
 * @param {{signal?: AbortSignal | null, headers?: Record<string, string>}} [init]
 * @param {typeof https} [transport] another client for tests (node:http)
 * @returns {Promise<any>}
 */
export function imageRequest(href, init = {}, transport = https) {
  const scheme = new URL(href).protocol;
  return new Promise((resolve, reject) => {
    /** @param {string} url @param {number} redirects */
    const go = (url, redirects) => {
      const request = transport.get(
        url,
        {
          agent: false,
          headers: init.headers ?? {},
          ...(init.signal ? {signal: init.signal} : {}),
        },
        response => {
          const status = response.statusCode ?? 0;
          const location = response.headers.location;
          if (
            status >= 300 &&
            status < 400 &&
            location &&
            redirects < MOST_REDIRECTS
          ) {
            response.destroy();
            /** @type {URL} */
            let next;
            try {
              next = new URL(location, url);
            } catch {
              resolve({
                ok: false,
                status,
                url,
                badLocation: true,
                headers: {get: () => null},
                body: null,
              });
              return;
            }
            if (next.username || next.password) {
              resolve({
                ok: false,
                status,
                url,
                credentialsLocation: true,
                headers: {get: () => null},
                body: null,
              });
              return;
            }
            if (next.protocol !== scheme) {
              resolve({
                ok: false,
                status,
                url: next.href,
                headers: {get: () => null},
                body: null,
              });
              return;
            }
            go(next.href, redirects + 1);
            return;
          }
          resolve({
            ok: status >= 200 && status < 300,
            status,
            url,
            headers: {
              /** @param {string} name */
              get: name => {
                const value = response.headers[name.toLowerCase()];
                return Array.isArray(value)
                  ? value.join(', ')
                  : (value ?? null);
              },
            },
            body: Object.assign(response, {
              cancel: async () => {
                response.destroy();
              },
            }),
          });
        },
      );
      request.on('error', reject);
    };
    go(href, 0);
  });
}

/**
 * @typedef {{uri: string} | {reason: string, answered?: boolean}} RemoteImage
 *   the data: URI the file carries, or why the image was not fetched;
 *   `answered` when the server answered with something that is not an
 *   image (another type, such as JSON or a page)
 */

/**
 * The remote images of one render. `get` fetches the addresses no earlier
 * call fetched, and `results` holds every answer by the address as the page
 * wrote it.
 * @param {{fetch?: (href: string, init: any) => Promise<any>, timeoutMs?: number, answerMs?: number, budgetMs?: number, maxBytes?: number}} [options]
 */
export function remoteImages({
  fetch = imageRequest,
  timeoutMs = REMOTE_IMAGE_TIMEOUT_MS,
  answerMs = REMOTE_IMAGE_ANSWER_MS,
  budgetMs = REMOTE_IMAGES_BUDGET_MS,
  maxBytes = MAX_ASSET_BYTES,
} = {}) {
  /** @type {Map<string, RemoteImage>} */
  const results = new Map();
  /** Every address asked for, in the order the render first named it. @type {Set<string>} */
  const asked = new Set();
  /** The answer of each address being fetched now. @type {Map<string, Promise<RemoteImage>>} */
  const inflight = new Map();
  const budget = new AbortController();
  /** @type {ReturnType<typeof setTimeout> | null} */
  let timer = null;
  const tooBig = `larger than ${maxBytes / 1048576} MB, the most a rendered page carries of one file`;
  const late = 'the render ran out of the time it gives remote images';
  const notAsked =
    'not asked: the network answered none of the first images the render asked for';
  // Requests the network answered with a success, and requests it never
  // answered. An error status does not count as an answer: a proxy in front
  // of a machine with no way out answers that way. Once a request goes
  // unanswered while none has succeeded, the next request waits for every
  // one in flight; if none of them succeeded, the machine has no network,
  // so the render asks for no more.
  let answered = 0;
  let unanswered = 0;
  let inFlight = 0;
  /** @type {(() => void)[]} */
  let waiting = [];
  /** @type {WeakSet<AbortController>} */
  const gotAnswer = new WeakSet();
  const noNetwork = () => answered === 0 && unanswered > 0;
  /** Resolves when no request is in flight. */
  const settled = () =>
    inFlight === 0
      ? Promise.resolve()
      : new Promise(resolve => {
          waiting.push(() => resolve(undefined));
        });

  /**
   * Why a request failed: its own time limits, the render's, or the network.
   * @param {AbortController} request
   */
  const failure = request => {
    if (budget.signal.aborted) return late;
    if (gotAnswer.has(request)) {
      return request.signal.aborted
        ? `the image did not arrive within ${timeoutMs / 1000} s`
        : 'the connection closed before the image arrived';
    }
    unanswered++;
    return request.signal.aborted
      ? `no answer within ${Math.min(answerMs, timeoutMs) / 1000} s`
      : 'the network could not reach it';
  };

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
    if (noNetwork()) return {reason: notAsked};
    // One request's own time limits, and the render's for every image.
    const request = new AbortController();
    const stopRequest = () => request.abort();
    const limit = setTimeout(stopRequest, timeoutMs);
    budget.signal.addEventListener('abort', stopRequest, {once: true});
    inFlight++;
    try {
      return await read(parsed, request);
    } finally {
      clearTimeout(limit);
      budget.signal.removeEventListener('abort', stopRequest);
      inFlight--;
      if (inFlight === 0) {
        const done = waiting;
        waiting = [];
        for (const resolve of done) resolve();
      }
    }
  }

  /**
   * @param {URL} parsed
   * @param {AbortController} request
   * @returns {Promise<RemoteImage>}
   */
  async function read(parsed, request) {
    /** @type {any} */
    let response;
    const noAnswer = setTimeout(() => request.abort(), answerMs);
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
    } finally {
      clearTimeout(noAnswer);
    }
    gotAnswer.add(request);
    if (response.ok) answered++;
    const stop = () => response.body?.cancel().catch(() => {});
    if (response.badLocation) {
      return {reason: 'it moved to an address that is not valid'};
    }
    if (response.credentialsLocation) {
      return {reason: 'it moved to an address that holds a user name or password, which a render never sends'};
    }
    if (response.url && !response.url.startsWith('https:')) {
      stop();
      return {reason: 'it moved to an address that is not https'};
    }
    if (!response.ok) {
      stop();
      return {reason: `the server answered ${response.status}`};
    }
    const type = (response.headers.get('content-type') ?? '')
      .split(';')[0]
      .trim()
      .toLowerCase();
    if (!type.startsWith('image/')) {
      stop();
      return {reason: 'not an image', answered: true};
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
    if (!image) return {reason: 'not an image', answered: true};
    return {uri: `data:${image};base64,${bytes.toString('base64')}`};
  }

  return {
    results,
    /**
     * Fetch each address no earlier call fetched, a few at a time.
     * @param {Iterable<string>} urls as the page wrote them
     */
    async get(urls) {
      const named = [...new Set(urls)];
      // An address an earlier call is still fetching is waited for, not
      // asked for again.
      const earlier = named.filter(url => asked.has(url) && !results.has(url));
      const wanted = named.filter(url => !asked.has(url));
      for (const url of wanted) asked.add(url);
      if (wanted.length === 0) {
        await Promise.all(earlier.map(url => inflight.get(url)));
        return;
      }
      if (timer === null) {
        timer = setTimeout(() => budget.abort(), budgetMs);
        timer.unref?.();
      }
      let next = 0;
      const worker = async () => {
        for (;;) {
          if (noNetwork()) await settled();
          if (next >= wanted.length) return;
          const url = wanted[next++];
          const answer = one(url);
          inflight.set(url, answer);
          results.set(url, await answer);
          inflight.delete(url);
        }
      };
      await Promise.all([
        ...Array.from({length: Math.min(AT_ONCE, wanted.length)}, worker),
        ...earlier.map(url => inflight.get(url)),
      ]);
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
      // In the order the page names them, whichever answered first.
      for (const url of asked) {
        const result = results.get(url);
        if (!result) continue;
        if ('uri' in result) fetched.push(url);
        else failed.push({url, reason: result.reason});
      }
      return {fetched, failed};
    },
  };
}
