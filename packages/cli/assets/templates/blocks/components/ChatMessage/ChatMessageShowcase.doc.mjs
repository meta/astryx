// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatMessage',
  name: 'ChatMessage',
  displayName: 'Chat Message',
  description: 'A user multi-bubble group with delivery status and an assistant ghost response with avatar, name, timestamp, and model info.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Chat', 'ChatMessage', 'ChatMessageBubble', 'ChatMessageMetadata', 'Avatar', 'Timestamp', 'Text', 'Layout'],
  fits: ['chat'],
};
