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
};
