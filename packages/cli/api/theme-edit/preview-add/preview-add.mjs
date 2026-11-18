// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditPreviewAdd` leaf: `astryx experimental theme preview add`.
 * This is the public function; its work and all environment access are in
 * the adapter.
 *
 * @position api/theme-edit/preview-add — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * Add pages to the in-app theme preview, and write the preview route the
 * first time. With a description, the build ranking picks the template
 * pages that fit it best (`top` of them); `template` names one instead.
 * With neither, the default pages: the sample app page and every component.
 * @experimental
 * @param {string} [description]
 * @param {import('../theme-edit.type.mjs').ThemeEditPreviewAddOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditPreviewAddResponse>}
 */
export async function themeEditPreviewAdd(description, options = {}) {
  return adapter.themeEditPreviewAdd(description, options);
}
