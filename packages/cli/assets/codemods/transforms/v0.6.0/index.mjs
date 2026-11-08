// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next transform manifest
 *
 * Staged codemods for the next release. The Version Packages PR promotes
 * this file into the resolved version folder.
 */

import moveImeHelperImport, {
  meta as moveImeHelperImportMeta,
} from './move-ime-helper-import.mjs';
import migrateAstryxThemeSelectorsToDataAttrs, {
  meta as migrateAstryxThemeSelectorsToDataAttrsMeta,
} from './migrate-astryx-theme-selectors-to-data-attrs.mjs';
import removeFocusIsrtlOption, {
  meta as removeFocusIsrtlOptionMeta,
} from './remove-focus-isrtl-option.mjs';
import renameResizablePixelBounds, {
  meta as renameResizablePixelBoundsMeta,
} from './rename-resizable-pixel-bounds.mjs';

export default [
  {
    name: 'migrate-astryx-theme-selectors-to-data-attrs',
    transform: migrateAstryxThemeSelectorsToDataAttrs,
    meta: migrateAstryxThemeSelectorsToDataAttrsMeta,
  },
  {
    name: 'move-ime-helper-import',
    transform: moveImeHelperImport,
    meta: moveImeHelperImportMeta,
  },
  {
    name: 'remove-focus-isrtl-option',
    transform: removeFocusIsrtlOption,
    meta: removeFocusIsrtlOptionMeta,
  },
  {
    name: 'rename-resizable-pixel-bounds',
    transform: renameResizablePixelBounds,
    meta: renameResizablePixelBoundsMeta,
  },
];
