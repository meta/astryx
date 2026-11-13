// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatMessageList',
  name: 'ChatMessageList',
  displayName: 'Chat Message List',
  description: 'Basic AI chat conversation with user and assistant messages. The simplest way to render a message list with alternating sender bubbles, metadata, and a date divider.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Chat', 'ChatMessageList', 'Layout', 'Timestamp'],
  fits: ['chat'],
};
