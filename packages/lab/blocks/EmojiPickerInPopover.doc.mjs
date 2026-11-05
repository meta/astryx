// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'In a popover',
  displayName: 'In a popover',
  description:
    'Open the picker from an emoji button in a Popover with no padding. Leave the Popover’s autofocus on: it lands in the search field, so typing searches right away.',
  exampleFor: 'EmojiPicker',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['EmojiPicker', 'Popover', 'IconButton', 'Text', 'HStack'],
};
