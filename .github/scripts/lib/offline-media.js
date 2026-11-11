// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global Buffer, module */

/**
 * @file Keeps a page's network local, so no browser check depends on a remote
 *   host.
 * @input A Playwright page or browser context, the origin it serves stories
 *   from, and whether to block remote requests that are not images.
 * @output Every image request to another host is answered with a small local
 *   image. With `abortOther`, every other request to another host fails at
 *   once. Requests to the story origin and to the loopback host pass.
 * @position Used by the accessibility audit, and by the shared Playwright base
 *   test (`@astryxdesign/a11y-spec/playwright`) with `abortOther`.
 * SYNC: offline-media.d.ts declares these exports for TypeScript callers.
 */

/** A neutral stand-in: a transparent 400 × 400 SVG. */
const STAND_IN_IMAGE = Buffer.from(
  "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'/>",
);

const IMAGE_PATH = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]']);

// Playwright matches a route pattern in the browser process. Loopback
// requests then go on without a round trip to the test process.
const NOT_LOOPBACK = /^https?:\/\/(?!(?:localhost|127\.0\.0\.1|\[::1\])[:/])/;

/**
 * The URL when it goes to a remote host: an http(s) host other than the story
 * origin and the loopback host. Otherwise null. A `data:` or `blob:` URL
 * makes no network request, so it is never remote.
 *
 * @param {string} url
 * @param {string | undefined} storyOrigin
 * @returns {URL | null}
 */
function remoteURL(url, storyOrigin) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  if (parsed.origin === storyOrigin) return null;
  if (LOOPBACK_HOSTS.has(parsed.hostname)) return null;
  return parsed;
}

/**
 * Whether a request is a remote image: an image fetch to a host other than
 * the story origin. A request the browser makes for an `<img>`, a CSS
 * background or an `<image>` has resource type `image`; a fetch() of an image
 * URL is matched by its extension.
 *
 * @param {{url: string, resourceType: string}} request
 * @param {string | undefined} storyOrigin
 */
function isRemoteImage({url, resourceType}, storyOrigin) {
  const remote = remoteURL(url, storyOrigin);
  if (remote == null) return false;
  return resourceType === 'image' || IMAGE_PATH.test(remote.pathname);
}

/**
 * Whether a request goes to a remote host and is not an image: with
 * `abortOther`, these requests fail.
 *
 * @param {{url: string, resourceType: string}} request
 * @param {string | undefined} storyOrigin
 */
function isRemoteNonImage(request, storyOrigin) {
  return (
    remoteURL(request.url, storyOrigin) != null &&
    !isRemoteImage(request, storyOrigin)
  );
}

/**
 * Answers every remote image on `target` (a page or a browser context)
 * locally. With `abortOther`, every other remote request fails at once, so a
 * remote font, script or API call cannot hold the load event. Await it before
 * the first navigation.
 *
 * @param {{route: Function}} target
 * @param {string | undefined} storyOrigin
 * @param {{abortOther?: boolean}} [options]
 * @returns {Promise<void>}
 */
async function routeRemoteImages(
  target,
  storyOrigin,
  {abortOther = false} = {},
) {
  await target.route(NOT_LOOPBACK, async route => {
    const request = route.request();
    const facts = {url: request.url(), resourceType: request.resourceType()};
    if (isRemoteImage(facts, storyOrigin)) {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: STAND_IN_IMAGE,
      });
      return;
    }
    if (abortOther && isRemoteNonImage(facts, storyOrigin)) {
      await route.abort('blockedbyclient');
      return;
    }
    await route.continue();
  });
}

module.exports = {
  STAND_IN_IMAGE,
  isRemoteImage,
  isRemoteNonImage,
  routeRemoteImages,
};
