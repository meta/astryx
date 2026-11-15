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
  // Before marking ready: the 'Shell - Messaging' category puts this template
  // in the Shell family, so build may start a part or an edit from it. Build
  // must keep the default shell for parts and edits whose words this template
  // does not use (see "the default app shell with the messaging shell ready"
  // in packages/cli/api/build/kit/start.test.mjs, which reads this doc), and
  // build's page-pick model must be retrained to include this template.
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
