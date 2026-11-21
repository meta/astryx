// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditCheck` leaf: `astryx experimental theme check`.
 * This is the public function; its work and all environment access are in
 * the adapter.
 *
 * @position api/theme-edit/check — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * Build a theme source and list what a person would see as broken in light
 * and dark; with `fix`, write the repair into the theme source and check
 * again.
 * @experimental
 * @param {string} theme a theme name in src/themes/ or a theme file
 * @param {import('../theme-edit.type.mjs').ThemeEditCheckOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditCheckResponse>}
 */
export async function themeEditCheck(theme, options = {}) {
  return adapter.themeEditCheck(theme, options);
}
