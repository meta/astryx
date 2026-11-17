// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditUndo` leaf: `astryx experimental theme editor undo`.
 * This is the public function; its work and all environment access are in
 * the adapter.
 *
 * @position api/theme-edit/undo — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * Put the theme back as it was before its last change. With `thing`, remove
 * that one setting instead, wherever it is in the settings: it goes back to
 * the base theme's value.
 * @experimental
 * @param {string} theme
 * @param {import('../theme-edit.type.mjs').ThemeEditUndoOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditUndoResponse | import('../theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
export async function themeEditUndo(theme, options = {}) {
  return adapter.themeEditUndo(theme, options);
}
