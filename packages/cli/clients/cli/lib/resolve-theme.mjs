// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file The `component` command's theme lookup for its text view: the API's
 * active-theme resolver, with each warning printed to standard error.
 */

/**
 * Print a theme warning as one inert line. The configured theme value and the
 * generated record come from the checkout, so a newline, an escape sequence or
 * a bidi override in them must not rewrite the terminal. Control and format
 * characters print as U+FFFD.
 * @param {string} message
 */
function warnTheme(message) {
  console.warn(message.replace(/[\p{Cc}\p{Cf}]/gu, '\uFFFD'));
}

/**
 * Resolve the active theme and print each warning about it.
 *
 * @param {string} [cwd] Working directory (defaults to process.cwd())
 */
export async function resolveTheme(cwd = process.cwd()) {
  // The theme API loads on first use: most commands never need it.
  const {resolveActiveTheme} = await import('../../../api/theme/theme.mjs');
  return resolveActiveTheme(cwd, {onWarning: warnTheme});
}
