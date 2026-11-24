// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Plan picker',
  displayName: 'Plan picker',
  description:
    'Three plan cards in a row, one chosen at a time. The group is a radio group: one tab stop, the arrow keys move and select, and screen readers speak the position ("2 of 3").',
  exampleFor: 'SelectableCardGroup',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['SelectableCardGroup', 'SelectableCard', 'VStack', 'Text'],
};
