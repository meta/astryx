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

export {themeEditNew} from './new/new.mjs';
export {themeEditSet} from './set/set.mjs';
export {themeEditShow} from './show/show.mjs';
export {themeEditUndo} from './undo/undo.mjs';
export {themeEditPreviewAdd} from './preview-add/preview-add.mjs';
export {themeEditPreviewApp} from './preview-app/preview-app.mjs';
export {themeEditPreviewList} from './preview-list/preview-list.mjs';
export {themeEditPreviewRemove} from './preview-remove/preview-remove.mjs';
export {themeEditHow} from './how/how.mjs';
