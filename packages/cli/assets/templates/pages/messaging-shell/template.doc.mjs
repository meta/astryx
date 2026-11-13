// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Messaging Shell',
  displayName: 'Messaging Shell',
  description:
    'Four-column nested navigation narrowing left to right (team workspace, channel list, message stream, thread panel) where each column scopes the next. Dense rows, zero cards.',
  keywords: [
    'team messaging',
    'chat',
    'channels',
    'threads',
    'inbox',
    'direct message',
    'conversation workspace',
  ],
  isReady: false,
  category: 'Shell - Messaging',
  icons: {
    BellIcon: 'notification',
    BookmarkIcon: 'bookmark',
    ChatBubbleLeftRightIcon: 'conversation',
    Cog6ToothIcon: 'settings',
    HashtagIcon: 'tag',
    HomeIcon: 'home',
    InboxIcon: 'inbox',
    MagnifyingGlassIcon: 'search',
    PencilSquareIcon: 'compose',
    UserGroupIcon: 'users',
    XMarkIcon: 'close',
  },
  slots: [
    {
      name: 'workspace-rail',
      kind: 'navigation',
      description:
        'Narrow 68px far-left column with workspace avatar, home, DMs, activity, saved, and settings icon buttons.',
    },
    {
      name: 'channel-sidebar',
      kind: 'navigation',
      description:
        '260px second column with workspace heading, jump-to search, and compact channel and direct message lists.',
    },
    {
      name: 'stream-header',
      kind: 'header',
      description:
        'Top of the center column showing channel name, topic, online count, and members button.',
    },
    {
      name: 'messages',
      kind: 'chat',
      description:
        'Center column body with the channel message stream, date dividers, empty state, and message composer.',
    },
    {
      name: 'thread-panel',
      kind: 'panel',
      description:
        'Right 340px column with thread header, root message, replies, and a compact reply composer.',
    },
  ],
};
