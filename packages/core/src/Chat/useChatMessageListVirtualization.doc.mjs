// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useChatMessageListVirtualization',
  displayName: 'useChatMessageListVirtualization',
  keywords: [
    'chat',
    'virtualization',
    'windowing',
    'long conversation',
    'transcript',
    'message list',
    'performance',
    'scroll to message',
  ],
  params: [
    // The hook takes no arguments. The list's estimateItemSize sizes the rows.
  ],
  returns: [
    {
      name: 'virtualization',
      type: 'ChatMessageListVirtualizationCapability',
      description:
        'An opaque capability. Pass it as ChatMessageList virtualization, with the list in ChatLayout and its items, getItemKey and renderItem set.',
    },
  ],
  usage: {
    description:
      'Windows a long conversation. Inside ChatLayout, ChatMessageList mounts only the rows near the scrollport and stands for the rest with spacers, so thousands of messages cost about one screen of DOM. The list opens at its newest message. Rows render at the estimateItemSize height until they measure. While the layout follows the newest message, the end stays in place as rows above it measure; otherwise the row the reader is on stays in place. The newest message always stays mounted. A streaming reply and new messages are followed as in any ChatLayout, and a ChatMessage that arrives while the reader is in history shows New messages on the scroll button, as with children. Older items that load at the top through scrollToTopAction keep the reader in place. While the reader scrolls, the list holds its corrections in the space above the rows, so it never stops a finger’s momentum or a smooth scroll, and writes them when the scroll ends. handleRef.scrollToItem reveals any item for find in a conversation and links to a message. Browser find in page (Ctrl+F or Cmd+F) sees only the mounted rows. The log does not read out rows that mount while the reader scrolls history. Outside ChatLayout every item renders.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Give each item a stable key from its data. The list keeps sizes and the reader’s place by key, so older items that load above do not move the view.',
      },
      {
        guidance: true,
        description:
          'Estimate each item close to its rendered height, by kind when kinds differ, such as a one-line tool row and a long answer.',
      },
      {
        guidance: true,
        description:
          'For find in a conversation, search the items and call handleRef.scrollToItem: browser find does not reach rows that are not mounted.',
      },
      {
        guidance: false,
        description:
          'Use an index as the key, or mutate the items array in place. Replace the array to change it.',
      },
      {
        guidance: false,
        description:
          'Turn the capability on and off during a conversation. Pass it for the list’s whole life, or remount the list when it changes.',
      },
    ],
  },
  relatedComponents: ['ChatMessageList', 'ChatLayout'],
  importPath: '@astryxdesign/core/Chat',
  category: 'Chat',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'windowing capability for ChatMessageList items inside ChatLayout; ~1 screen of DOM for 1000s of msgs',
  returnDescriptions: {
    virtualization:
      'opaque capability; pass as ChatMessageList virtualization with items/getItemKey/renderItem',
  },
  usage: {
    description:
      'opens at newest; newest always mounted; end stays put while following and rows measure, else the reader’s row stays put; streaming + appends followed as in ChatLayout; New messages for a ChatMessage that arrives while in history; older items via scrollToTopAction keep place; corrections wait for a scroll to end; handleRef.scrollToItem reveals any item; Ctrl+F sees mounted rows only; history rows not announced; outside ChatLayout renders all',
    bestPractices: [
      {guidance: true, description: 'stable key from data, never the index'},
      {
        guidance: true,
        description: 'estimate close to rendered height, per kind',
      },
      {
        guidance: true,
        description: 'find in conversation: search items + scrollToItem',
      },
      {guidance: false, description: 'mutate items in place'},
      {guidance: false, description: 'toggle the capability mid-conversation'},
    ],
  },
};
