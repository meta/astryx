// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useChatMessageListVirtualization',
  name: 'useChatMessageListVirtualization — Long conversation',
  displayName: 'useChatMessageListVirtualization — Long conversation',
  description:
    'A ChatLayout whose ChatMessageList renders 2,000 messages from items, with virtualization from useChatMessageListVirtualization. Only the rows near the scrollport mount, and the list opens at the newest message. estimateItemSize gives a question and an answer different heights until each row measures.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Chat', 'ChatLayout', 'ChatMessageList'],
};
