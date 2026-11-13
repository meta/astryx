// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Resizable',
  alsoExampleFor: ['useResizable'],
  alsoShowcaseFor: ['useResizable'],
  name: 'Resizable',
  displayName: 'Resizable',
  description:
    'Horizontal resizable split with a draggable handle between two panels.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Resizable', 'Card', 'Layout', 'Text'],
  fits: ['panel'],
};
