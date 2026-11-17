// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Messaging Shell',
  displayName: 'Messaging Shell',
  description:
    "Team messaging app frame: side navigation of channels and direct messages with presence and unread counts, a message stream with a composer, and a thread panel that opens from a message's replies. Dense rows, zero cards.",
  keywords: [
    'team messaging',
    'chat',
    'channels',
    'threads',
    'direct message',
    'conversation workspace',
  ],
  // Before marking ready: the 'Shell - Messaging' category puts this template
  // in the Shell family, so build may start a part or an edit from it. Build
  // must keep the default shell for parts and edits whose words this template
  // does not use (see "the default app shell with the messaging shell ready"
  // in packages/cli/api/build/kit/start.test.mjs, which reads this doc).
  isReady: false,
  category: 'Shell - Messaging',
  icons: {
    Cog6ToothIcon: 'settings',
    HashtagIcon: 'tag',
    InboxIcon: 'inbox',
    MagnifyingGlassIcon: 'search',
    PencilSquareIcon: 'compose',
    UserGroupIcon: 'users',
    XMarkIcon: 'close',
  },
};
