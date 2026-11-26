// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'One billion archive records',
  displayName: 'One billion archive records',
  description:
    'Jump to the first, middle, or last record in a fixed-height archive, then use the wheel to browse nearby records.',
  exampleFor: 'InfinityList',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['InfinityList', 'Button', 'HStack', 'VStack', 'Text'],
};
