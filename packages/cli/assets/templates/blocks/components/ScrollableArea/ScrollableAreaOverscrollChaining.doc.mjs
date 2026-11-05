// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ScrollableArea',
  name: 'ScrollableArea — Overscroll',
  displayName: 'Scrollable Area — Overscroll',
  description:
    'The same section, two edge policies: the default overscroll="allow" hands a gesture that reaches the end to the panel behind it, while overscroll="contain" stops it at the section edge.',
  isReady: true,
  aspectRatio: 1,
  componentsUsed: ['ScrollableArea', 'Card', 'Grid'],
};
