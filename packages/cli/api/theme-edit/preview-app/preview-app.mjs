// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditPreviewApp` leaf: `astryx experimental theme preview app`.
 * This is the public function; its work and all environment access are in
 * the adapter.
 *
 * @position api/theme-edit/preview-app — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * Make a new starter app with the theme preview route and its default pages
 * inside. With `theme`, the theme is copied into the app and the pages wear
 * it. No install runs.
 * @experimental
 * @param {string} dir
 * @param {import('../theme-edit.type.mjs').ThemeEditPreviewAppOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditPreviewAppResponse>}
 */
export async function themeEditPreviewApp(dir, options = {}) {
  return adapter.themeEditPreviewApp(dir, options);
}
