// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditShow` leaf: `astryx experimental theme editor show`.
 * This is the public function; its work and all environment access are in
 * the adapter.
 *
 * @position api/theme-edit/show — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * Every setting of a theme, key resolved values, problems it caused, the
 * sample page and the theme-building page with every component.
 * @experimental
 * @param {string} theme
 * @param {import('../theme-edit.type.mjs').ThemeEditShowOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditShowResponse>}
 */
export async function themeEditShow(theme, options = {}) {
  return adapter.themeEditShow(theme, options);
}
