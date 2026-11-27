// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Two-axis archive',
  displayName: 'Two-axis archive',
  description:
    'Browse a table of one billion rows and one million columns. Jump to a cell, then scroll nearby rows and columns.',
  exampleFor: 'Table',
  alsoExampleFor: ['useTableInfinityVirtualization'],
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Table', 'Button', 'HStack', 'VStack', 'Text'],
};
