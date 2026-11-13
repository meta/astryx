// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `themeEditHow` leaf: `astryx experimental theme editor how`.
 * This is the public function; its work and all environment access are in
 * the adapter.
 *
 * @position api/theme-edit/how — re-exported by theme-edit.mjs
 */

import * as adapter from '../_adapter.mjs';

/**
 * Explain anything a theme change can name, or answer a question about one:
 * a part (what it reads for each aspect, its variants, states and the parts
 * inside it), a family (its members), a setting (a dial's rungs, a token's
 * type and readers, a CSS property), an aspect (colors, text, corners...: the
 * whole-theme tokens and dial), a plain-words question (exact commands), a
 * PNG picture (its main colors, or the color at points), or with `list` a
 * list of dials, tokens, parts, families or CSS properties.
 * @experimental
 * @param {string} subject a part, family, setting, aspect, question, or PNG file; with `list`, a filter
 * @param {import('../theme-edit.type.mjs').ThemeEditHowOptions} [options]
 * @returns {Promise<import('../theme-edit.type.mjs').ThemeEditHowResponse>}
 */
export async function themeEditHow(subject, options = {}) {
  return adapter.themeEditHow(subject, options);
}
