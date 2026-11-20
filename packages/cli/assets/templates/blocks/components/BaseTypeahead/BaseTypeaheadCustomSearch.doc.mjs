// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'BaseTypeahead',
  name: 'BaseTypeahead — Custom Search Bar',
  displayName: 'BaseTypeahead — Custom Search Bar',
  description:
    "BaseTypeahead embedded inside a custom-styled wrapper. The wrapper provides its own border and icon chrome; anchorRef positions the dropdown relative to it. Use this pattern when Typeahead's built-in field layout does not fit your composition.",
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['BaseTypeahead', 'Icon', 'Layout', 'Text'],
};
