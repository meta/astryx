// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditSet` leaf: `astryx experimental theme editor set`.
 * This is the public function; its work and all environment access are in
 * the adapter.
 *
 * @position api/theme-edit/set — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * Change one thing in a theme: checked, built, previewed.
 * @experimental
 * @param {string} theme
 * @param {string} thing a dial, a token, or a CSS property
 * @param {string} value
 * @param {import('../theme-edit.type.mjs').ThemeEditChangeOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
export async function themeEditSet(theme, thing, value, options = {}) {
  return adapter.themeEditSet(theme, thing, value, options);
}
