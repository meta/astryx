// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'BaseTypeahead',
  name: 'BaseTypeahead',
  displayName: 'Base Typeahead',
  description:
    'A custom result renderer that adds supporting metadata while BaseTypeahead retains option semantics and keyboard behavior.',
  registry: {slug: 'custom-search-bar'},
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['BaseTypeahead', 'Layout', 'Text'],
};
