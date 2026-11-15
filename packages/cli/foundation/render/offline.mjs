// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a picture's browser may load: the page's own files and inline
 * data, never the network. A page can name a remote stylesheet, font or
 * image (a base theme's Google Fonts import, a template's photo); a static
 * page's picture shows only what it carries, and a request to a network
 * that is not there (offline, or a host with no direct internet) would hold
 * the page's load until it timed out. Each picture script blocks every
 * other request before the page loads.
 * @output the URL rule both picture scripts apply
 * @position read by picture-chrome.mjs and picture-playwright.mjs
 */

/** A URL a picture's page may load: its own files and inline data. */
export const LOCAL_URL = /^(file|data|blob|about):/i;

/**
 * The same rule as DevTools protocol patterns (`Network.setBlockedURLs`):
 * every scheme that reaches a network.
 */
export const NETWORK_URL_PATTERNS = Object.freeze([
  'http://*',
  'https://*',
  'ws://*',
  'wss://*',
  'ftp://*',
]);
