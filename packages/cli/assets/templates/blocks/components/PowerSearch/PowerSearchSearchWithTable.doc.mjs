// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'PowerSearch',
  name: 'PowerSearch — Search with Table',
  displayName: 'PowerSearch — Search with Table',
  description:
    'Composition of PowerSearch with Table using usePowerSearchConfig to auto-generate config and filter data.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['PowerSearch', 'Table', 'Layout'],
  fits: ['table', 'toolbar'],
};
