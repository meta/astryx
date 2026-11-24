// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  name: 'New comment',
  displayName: 'New comment',
  description:
    'A comment composer quoting the passage it comments on: type, add an emoji from the picker the app supplies, and post with Enter or Post.',
  exampleFor: 'CommentComposer',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['CommentComposer', 'Button', 'HStack', 'VStack', 'Text'],
};
