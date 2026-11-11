// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditPreviewRemove` leaf: `astryx experimental theme preview remove`.
 * This is the public function; its work and all environment access are in
 * the adapter.
 *
 * @position api/theme-edit/preview-remove — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * Remove one page from the in-app theme preview, or with no page the whole
 * preview: only the files it wrote are deleted.
 * @experimental
 * @param {string} [page]
 * @param {import('../theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditPreviewRemoveResponse>}
 */
export async function themeEditPreviewRemove(page, options = {}) {
  return adapter.themeEditPreviewRemove(page, options);
}
