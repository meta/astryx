// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file What a picture's browser may load: the page's own files and inline
 * data, never the network. A page can name a remote stylesheet, font or
 * image (a base theme's Google Fonts import, a template's photo); a static
 * page's picture shows only what it carries, and a request to a network
 * that is not there (offline, or a host with no direct internet) would hold
 * the page's load until it timed out. Each picture script blocks every
 * other request before the page loads.
 * The browser itself is started with its own network off too: no
 * background requests (component and update checks, network time, sync,
 * metrics, field trials, sign-in), no proxy, and no host name resolves, so
 * a picture asks the network for nothing, page or browser.
 * @output the URL rule and the browser flags both picture scripts apply
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

/**
 * The flags a picture's Chrome starts with so the browser makes no network
 * request of its own (the ones Playwright and Puppeteer pass for
 * automation, and a resolver and proxy that reach nothing: a page of local
 * files needs neither).
 */
export const QUIET_BROWSER_ARGS = Object.freeze([
  '--disable-background-networking',
  '--disable-component-update',
  '--disable-sync',
  '--disable-default-apps',
  '--disable-domain-reliability',
  '--disable-client-side-phishing-detection',
  '--disable-breakpad',
  '--disable-field-trial-config',
  '--metrics-recording-only',
  '--no-first-run',
  '--no-default-browser-check',
  '--no-pings',
  '--disable-features=OptimizationHints,Translate,MediaRouter,DialMediaRouteProvider,AutofillServerCommunication,CertificateTransparencyComponentUpdater,NetworkTimeServiceQuerying,InterestFeedContentSuggestions',
  '--no-proxy-server',
  '--host-resolver-rules=MAP * ~NOTFOUND',
]);
