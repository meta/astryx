// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditNew` leaf: `astryx experimental theme editor new`.
 * This is the public function; its work and all environment access are in
 * the adapter.
 *
 * @position api/theme-edit/new — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * Start a theme in themes/<name>/, optionally on a built-in theme.
 * @experimental
 * @param {string} name
 * @param {import('../theme-edit.type.mjs').ThemeEditNewOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditNewResponse>}
 */
export async function themeEditNew(name, options = {}) {
  return adapter.themeEditNew(name, options);
}
