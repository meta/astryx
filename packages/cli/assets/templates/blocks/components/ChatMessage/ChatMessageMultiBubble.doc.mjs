// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatMessage',
  name: 'ChatMessage — Multi-Bubble',
  displayName: 'ChatMessage — Multi-Bubble',
  description: 'Grouped bubbles using the group prop for corner radius reduction. Use first, middle, and last to visually connect related bubbles from the same sender.',
  isReady: true,
  aspectRatio: 1,
  componentsUsed: ['Chat', 'ChatMessage', 'ChatMessageBubble', 'ChatMessageMetadata', 'Avatar', 'Timestamp', 'Text', 'Layout'],
  fits: ['chat'],
};
