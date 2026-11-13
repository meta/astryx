// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatMessageBubble',
  name: 'ChatMessageBubble — Grouping',
  displayName: 'ChatMessageBubble — Grouping',
  description: 'Multi-bubble messages using first, middle, and last group positions. Grouped bubbles tighten corner radius on the sender side for a continuous visual flow.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Chat', 'Avatar', 'Timestamp', 'Text', 'Layout'],
  fits: ['chat'],
};
