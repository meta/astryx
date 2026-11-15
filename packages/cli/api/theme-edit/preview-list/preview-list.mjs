// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditPreviewList` leaf: `astryx experimental theme preview list`.
 * This is the public function; its work and all environment access are in
 * the adapter.
 *
 * @position api/theme-edit/preview-list — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * The pages of the in-app theme preview.
 * @experimental
 * @param {import('../theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditPreviewListResponse>}
 */
export async function themeEditPreviewList(options = {}) {
  return adapter.themeEditPreviewList(options);
}
