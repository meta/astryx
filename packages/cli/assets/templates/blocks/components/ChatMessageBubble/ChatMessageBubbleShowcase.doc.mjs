// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatMessageBubble',
  name: 'ChatMessageBubble',
  displayName: 'Chat Message Bubble',
  description: 'Grouped user bubbles with filled styling and a ghost-variant agent response, with timestamps and delivery status.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Chat', 'ChatMessageBubble', 'ChatMessage', 'ChatMessageMetadata', 'Timestamp'],
  fits: ['chat'],
};
