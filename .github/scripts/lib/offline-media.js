// Copyright (c) Meta Platforms, Inc. and affiliates.

'use strict';
/* global Buffer, module */

/**
 * @file Answers a page's remote images locally, so no Storybook scan
 *   depends on a remote image host.
 * @input A Playwright page or browser context, and the origin it serves
 *   stories from.
 * @output Every image request to another host is answered with a small local
 *   image. Requests to the story origin, and remote requests that are not
 *   images, pass unchanged.
 * @position Used by the accessibility audit. A browser spec that loads remote
 *   photos may use it in place of its own stand-in.
 */

/** A neutral stand-in: a transparent 400 × 400 SVG. */
const STAND_IN_IMAGE = Buffer.from(
  "<svg xmlns='http://www.w3.org/2000/svg' width='400' height='400'/>",
);

const IMAGE_PATH = /\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp)$/i;

/**
 * Whether a request is a remote image: an image fetch to a host other than
 * the story origin. A request the browser makes for an `<img>`, a CSS
 * background or an `<image>` has resource type `image`; a fetch() of an image
 * URL is matched by its extension.
 *
 * @param {{url: string, resourceType: string}} request
 * @param {string} storyOrigin
 */
function isRemoteImage({url, resourceType}, storyOrigin) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
  if (parsed.origin === storyOrigin) return false;
  if (parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1')
    return false;
  return resourceType === 'image' || IMAGE_PATH.test(parsed.pathname);
}

/**
 * Answers every remote image on `target` (a page or a browser context)
 * locally. Await it before the first navigation.
 *
 * @param {{route: Function}} target
 * @param {string} storyOrigin
 * @returns {Promise<void>}
 */
async function routeRemoteImages(target, storyOrigin) {
  await target.route('**/*', async route => {
    const request = route.request();
    if (
      isRemoteImage(
        {url: request.url(), resourceType: request.resourceType()},
        storyOrigin,
      )
    ) {
      await route.fulfill({
        status: 200,
        contentType: 'image/svg+xml',
        body: STAND_IN_IMAGE,
      });
      return;
    }
    await route.continue();
  });
}

module.exports = {STAND_IN_IMAGE, isRemoteImage, routeRemoteImages};
