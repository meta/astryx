// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The dynamic import of an authored module by its file URL.
 *
 * @input An absolute `file:` URL, with any query its caller adds to name a
 *   fresh module.
 * @output The module's namespace object, as a plain `import()` gives it.
 * @position Called by the doc importers (../doc-compiler/import.mjs). The
 *   node test project loads this file natively, as the CLI does
 *   (vitest.config.ts). The doc files that a catalog command imports then load
 *   natively as well, without a request to the test runner for each of them.
 */

/**
 * Import the module at `url`.
 * @param {string} url an absolute `file:` URL
 * @returns {Promise<any>}
 */
export function importUrl(url) {
  return import(url);
}
