// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatMessageBubble',
  name: 'ChatMessageBubble — Custom Content',
  displayName: 'ChatMessageBubble — Custom Content',
  description: 'Custom in-message content aligned to the bubble text column. An artifact card is wrapped in a ghost bubble with width="100%", so its left edge matches the bubble text and it spans the full message column instead of the default bubble width cap; the timestamp rides the bubble metadata slot.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Chat', 'ChatMessage', 'ChatMessageBubble', 'ChatMessageMetadata', 'ClickableCard', 'Text', 'Timestamp'],
  fits: ['chat'],
};
