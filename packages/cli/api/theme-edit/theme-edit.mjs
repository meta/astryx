// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file Programmatic API for `astryx experimental theme editor` (make and
 * change a theme one checked change at a time) and `theme preview` (show it
 * on pages in the app).
 *
 *   themeEditNew('brand', {like: 'neutral'})           themeEdit.new
 *   themeEditSet('brand', 'corners', 'pill')            themeEdit.set
 *   themeEditUndo('brand')                              themeEdit.undo (one step)
 *   themeEditUndo('brand', {thing: 'corners'})          themeEdit.undo (one setting)
 *   themeEditShow('brand')                              themeEdit.show
 *   themeEditPreviewAdd('a sales dashboard')            themeEdit.previewAdd
 *   themeEditPreviewApp('theme-app')                    themeEdit.previewApp
 *   themeEditHow('banner')                              themeEdit.how
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
 * Every setting of a theme, key resolved values, problems it caused, the
 * sample page and the theme-building page with every component.
 * @experimental
 * @param {string} theme
 * @param {import('./theme-edit.type.mjs').ThemeEditShowOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditShowResponse>}
 */
export async function themeEditShow(theme, options = {}) {
  return adapter.themeEditShow(theme, options);
}

/**
 * Put the theme back as it was before its last change. With `thing`, remove
 * that one setting instead, wherever it is in the settings: it goes back to
 * the base theme's value.
 * @experimental
 * @param {string} theme
 * @param {import('./theme-edit.type.mjs').ThemeEditUndoOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditUndoResponse | import('./theme-edit.type.mjs').ThemeEditChangeResponse>}
 */
export async function themeEditUndo(theme, options = {}) {
  return adapter.themeEditUndo(theme, options);
}

/**
 * Add pages to the in-app theme preview, and write the preview route the
 * first time. With a description, the build ranking picks the template
 * pages that fit it best (`top` of them); `template` names one instead.
 * With neither, the default pages: the sample app page and every component.
 * @experimental
 * @param {string} [description]
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewAddOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewAddResponse>}
 */
export async function themeEditPreviewAdd(description, options = {}) {
  return adapter.themeEditPreviewAdd(description, options);
}

/**
 * Make a new starter app with the theme preview route and its default pages
 * inside. With `theme`, the theme is copied into the app and the pages wear
 * it. No install runs.
 * @experimental
 * @param {string} dir
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewAppOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewAppResponse>}
 */
export async function themeEditPreviewApp(dir, options = {}) {
  return adapter.themeEditPreviewApp(dir, options);
}

/**
 * The pages of the in-app theme preview.
 * @experimental
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewListResponse>}
 */
export async function themeEditPreviewList(options = {}) {
  return adapter.themeEditPreviewList(options);
}

/**
 * Remove one page from the in-app theme preview, or with no page the whole
 * preview: only the files it wrote are deleted.
 * @experimental
 * @param {string} [page]
 * @param {import('./theme-edit.type.mjs').ThemeEditPreviewListOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditPreviewRemoveResponse>}
 */
export async function themeEditPreviewRemove(page, options = {}) {
  return adapter.themeEditPreviewRemove(page, options);
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
 * @param {import('./theme-edit.type.mjs').ThemeEditHowOptions} [options]
 * @returns {Promise<import('./theme-edit.type.mjs').ThemeEditHowResponse>}
 */
export async function themeEditHow(subject, options = {}) {
  return adapter.themeEditHow(subject, options);
}
