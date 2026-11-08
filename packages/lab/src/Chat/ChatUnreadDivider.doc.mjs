// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ChatUnreadDivider',
  subComponentOf: 'Chat',
  group: 'Chat',
  category: 'Chat',
  displayName: 'Chat Unread Divider',
  description: 'Error-colored rule with a trailing label marking where unread messages begin in a chat thread. Rendered as an aria separator with an accessible label. Distinct from ChatSystemMessage\'s divider variant, which is for neutral date breaks.',
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Divider label shown at the end of the rule and used in the accessible name ("New messages below").',
      default: "'New'",
    },
  ],
};

export const docsZh = {
  name: 'ChatUnreadDivider',
  displayName: 'Chat Unread Divider',
  description: '错误色横线加末尾标签，标记聊天线程中未读消息的起点。渲染为带无障碍标签的 aria separator。与 ChatSystemMessage 的 divider 变体不同，后者用于中性的日期分隔。',
  propDescriptions: {
    label: '横线末尾显示的标签，同时用于无障碍名称。',
  },
};

export const docsDense = {
  name: 'ChatUnreadDivider',
  displayName: 'Chat Unread Divider',
  description: 'error-colored rule + trailing label marking first unread msg; aria separator; use ChatSystemMessage divider for neutral date breaks',
  propDescriptions: {
    label: "trailing label + aria name; default 'New'",
  },
};
