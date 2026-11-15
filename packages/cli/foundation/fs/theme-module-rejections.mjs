// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The promises theme modules create while the CLI reads them, and
 * whether code runs in a callback a theme module left after its load, so a
 * rejection one leaves unhandled, or an exception its callback throws, is
 * told as a warning, never the command's crash.
 *
 * @input promises the module loader records (`recordThemeModulePromise`)
 * @output `themeModuleRejection` and `themeModuleException`, the warnings
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

/** Whether code runs in a theme module's callback after its load. */
let inThemeModuleCallback = () => false;

/**
 * Set how to tell a theme module's callback after its load (the module
 * loader knows its async context).
 * @param {() => boolean} check
 */
export function tellThemeModuleCallbacks(check) {
  inThemeModuleCallback = check;
}

/**
 * What to tell for an uncaught exception thrown from a callback a theme
 * module left running after its load, or null for any other: the theme was
 * read as the module exported it, and a late throw does not fail the
 * command.
 * @param {unknown} error
 * @returns {string | null}
 */
export function themeModuleException(error) {
  if (!inThemeModuleCallback()) return null;
  const what =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : String(error);
  return `Warning: a theme module's callback threw after it loaded (${what}); the theme was read as the module exported it.`;
}
