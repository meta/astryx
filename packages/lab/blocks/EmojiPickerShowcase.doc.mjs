// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Inline picker',
  displayName: 'Inline picker',
  description:
    'An emoji picker inline in a Card: search by name or keyword, move with the arrow keys, and pick; the last pick shows above it.',
  exampleFor: 'EmojiPicker',
  isReady: true,
  isShowcase: true,
  aspectRatio: 1,
  componentsUsed: ['EmojiPicker', 'Card', 'HStack', 'VStack', 'Text'],
};
