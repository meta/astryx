// Copyright (c) Meta Platforms, Inc. and affiliates.
/**
 * @file next transform manifest
 *
 * Staged codemods for the next release. The Version Packages PR promotes
 * this file into the resolved version folder.
 */

import promoteTokenizerPresentation, {
  meta as promoteTokenizerPresentationMeta,
} from './promote-tokenizer-presentation.mjs';
import migrateUseMenuPressToRefForm, {
  meta as migrateUseMenuPressToRefFormMeta,
} from './migrate-use-menu-press-to-ref-form.mjs';

export default [
  {
    name: 'promote-tokenizer-presentation',
    transform: promoteTokenizerPresentation,
    meta: promoteTokenizerPresentationMeta,
  },
  {
    name: 'migrate-use-menu-press-to-ref-form',
    transform: migrateUseMenuPressToRefForm,
    meta: migrateUseMenuPressToRefFormMeta,
  },
];
