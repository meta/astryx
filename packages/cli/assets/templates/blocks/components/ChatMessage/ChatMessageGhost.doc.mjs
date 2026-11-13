// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatMessage',
  name: 'ChatMessage — Ghost',
  displayName: 'ChatMessage — Ghost',
  description: 'Ghost variant for messages without visible bubble boundaries. Keeps padding for alignment but renders a transparent background, useful for AI-style responses.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Chat', 'ChatMessage', 'ChatMessageBubble', 'ChatMessageMetadata', 'Timestamp', 'Text', 'Layout'],
  fits: ['chat'],
};
