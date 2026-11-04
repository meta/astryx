// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next transform manifest
 *
 * Staged codemods for the next release. The Version Packages PR promotes
 * this file into the resolved version folder.
 */

import migrateThemeCatalogToDescriptors, {
  meta as migrateThemeCatalogToDescriptorsMeta,
} from './migrate-theme-catalog-to-descriptors.mjs';
import migrateNativePickerToPresentation, {
  meta as migrateNativePickerToPresentationMeta,
} from './migrate-native-picker-to-presentation.mjs';

export default [
  {
    name: 'migrate-theme-catalog-to-descriptors',
    transform:
      /** @type {import('../../../../authoring/codemod/type').CodemodTransform} */ (
        /** @type {unknown} */ (migrateThemeCatalogToDescriptors)
      ),
    meta: migrateThemeCatalogToDescriptorsMeta,
  },
  {
    name: 'migrate-native-picker-to-presentation',
    transform: migrateNativePickerToPresentation,
    meta: migrateNativePickerToPresentationMeta,
  },
];
