// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file next transform manifest
 *
 * Staged codemods for the next release. The Version Packages PR promotes
 * this file into the resolved version folder.
 */

import migrateCopiedThemesToDescriptors, {
  meta as migrateCopiedThemesToDescriptorsMeta,
} from './migrate-copied-themes-to-descriptors.mjs';

export default [
  {
    name: 'migrate-copied-themes-to-descriptors',
    transform:
      /** @type {import('../../../../authoring/codemod/type').CodemodTransform} */ (
        /** @type {unknown} */ (migrateCopiedThemesToDescriptors)
      ),
    meta: migrateCopiedThemesToDescriptorsMeta,
  },
];
