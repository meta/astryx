// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The promises theme modules create while the CLI reads them, so a
 * rejection one leaves unhandled is told as a warning, never the command's
 * crash.
 *
 * @input promises the module loader records (`recordThemeModulePromise`)
 * @output `themeModuleRejection`, the warning for one of them
 * @position written by the module loader (module-loader.mjs), read by the
 *   CLI's unhandled-rejection handler (clients/cli/run.mjs)
 */

/** @type {WeakSet<Promise<unknown>>} */
const themeModulePromises = new WeakSet();

/**
 * Record a promise a theme module created.
 * @param {Promise<unknown>} promise
 */
export function recordThemeModulePromise(promise) {
  themeModulePromises.add(promise);
}

/**
 * What to tell for an unhandled rejection of a promise a theme module
 * created, or null for any other promise: the module was read for its
 * export, and a promise it left rejecting does not fail the command.
 * @param {unknown} reason
 * @param {Promise<unknown>} promise
 * @returns {string | null}
 */
export function themeModuleRejection(reason, promise) {
  if (!themeModulePromises.has(promise)) return null;
  const what =
    reason instanceof Error
      ? reason.message
      : typeof reason === 'string'
        ? reason
        : String(reason);
  return `Warning: a theme module left a promise that rejected and was never handled (${what}); the theme was read as the module exported it.`;
}
