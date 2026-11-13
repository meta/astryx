// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatMessage',
  name: 'ChatMessage — Avatar & Name',
  displayName: 'ChatMessage — Avatar & Name',
  description: 'Messages with avatars and sender names. Place the name on the bubble when using bubbles, or on the message wrapper for raw content.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Chat', 'ChatMessage', 'ChatMessageBubble', 'ChatMessageMetadata', 'Avatar', 'Timestamp', 'Text', 'Layout'],
  fits: ['chat'],
};
