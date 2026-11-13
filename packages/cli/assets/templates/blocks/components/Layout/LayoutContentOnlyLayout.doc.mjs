// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Layout',
  name: 'Layout — Content Only',
  displayName: 'Layout — Content Only',
  description:
    'A minimal layout with just a content area inside a card, without header or footer.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Layout', 'LayoutContent', 'Card', 'VStack', 'Text', 'Heading'],
  fits: ['content'],
};
