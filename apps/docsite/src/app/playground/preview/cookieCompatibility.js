// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Browser bootstrap guard for deployment tooling that probes cookies.
 * @input The current document and its pathname.
 * @output An inert cookie property only for the opaque-origin playground frame.
 * @position Prepended to the client main-app entry by next.config.mjs so it runs
 *   before framework and deployment-injected modules.
 */
(() => {
  if (globalThis.location.pathname !== '/playground/preview') {
    return;
  }

  try {
    void globalThis.document.cookie;
  } catch {
    Object.defineProperty(globalThis.document, 'cookie', {
      configurable: true,
      get: () => '',
      set: () => {},
    });
  }
})();
