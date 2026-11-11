// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for `astryx experimental theme`: make and change a
 * theme one checked change at a time.
 *
 *   themeEditNew('brand', {like: 'neutral'})           themeEdit.new
 *   themeEditSet('brand', 'corners', 'pill')            themeEdit.set
 *   themeEditReset('brand', 'corners')                  themeEdit.reset
 *   themeEditShow('brand')                              themeEdit.show
 *   themeEditUndo('brand')                              themeEdit.undo
 *   themeEditPreview('brand', {write: 'src/app/theme'}) themeEdit.preview
 *   themeEditExplain('banner')                          themeEdit.explain
 *
 * Every change is checked first against what the installed Core's parts
 * really read; a change that cannot take effect is refused and nothing is
 * written. An accepted change rebuilds the theme with the theme build and
 * writes a preview.
 *
 * @input a theme name and a change, a question, or a picture
 * @output themeEdit.* envelopes
 * @position api/theme-edit — command wrapper in
 *   clients/cli/commands/experimental/theme.mjs; the work is in _adapter.mjs
 */

import * as adapter from './_adapter.mjs';

/** @typedef {import('./theme-edit.type.mjs').ThemeEditChangeOptions} ChangeOptions */

/**
 * Start a theme in themes/<name>/, optionally on a built-in theme.
 * @experimental
 * @param {string} name
 * @param {import('./theme-edit.type.mjs').ThemeEditNewOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditNewResponse>}
 */
export async function themeEditNew(name, options = {}) {
  return adapter.themeEditNew(name, options);
}

/**
 * Change one thing in a theme: checked, built, previewed.
 * @experimental
 * @param {string} theme
 * @param {string} thing a dial, a token, or a CSS property
 * @param {string} value
 * @param {ChangeOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
export async function themeEditSet(theme, thing, value, options = {}) {
  return adapter.themeEditSet(theme, thing, value, options);
}

/**
 * Return one setting to the base theme's value: the setting is removed,
 * and the theme is rebuilt and previewed.
 * @experimental
 * @param {string} theme
 * @param {string} thing
 * @param {ChangeOptions & {value?: string}} [options] `value` names which half of
 *   the `headings` dial to reset (`weight` or `tracking`)
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
export async function themeEditReset(theme, thing, options = {}) {
  return adapter.themeEditReset(theme, thing, options);
}

/**
 * Every setting of a theme, key resolved values, problems it caused, the
 * sample page and the theme-building page with every component.
 * @experimental
 * @param {string} theme
 * @param {{cwd?: string, png?: boolean, group?: string}} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditShowResponse>}
 */
export async function themeEditShow(theme, options = {}) {
  return adapter.themeEditShow(theme, options);
}

/**
 * Put the theme back as it was before its last change.
 * @experimental
 * @param {string} theme
 * @param {{cwd?: string, png?: boolean}} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditUndoResponse>}
 */
export async function themeEditUndo(theme, options = {}) {
  return adapter.themeEditUndo(theme, options);
}

/**
 * The theme-building page: every component grouped, each variant side by
 * side, overlays open, and full template pages. Rendered to one HTML file,
 * or with `write` written into the app as a page module.
 * @experimental
 * @param {string} theme
 * @param {{cwd?: string, write?: string, group?: string, png?: boolean}} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewResponse>}
 */
export async function themeEditPreview(theme, options = {}) {
  return adapter.themeEditPreview(theme, options);
}

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
 * @param {import('./theme-edit.type.mjs').ThemeEditExplainOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditExplainResponse>}
 */
export async function themeEditExplain(subject, options = {}) {
  return adapter.themeEditExplain(subject, options);
}
