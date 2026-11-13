// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Inbox Table',
  displayName: 'Inbox Table',
  description:
    'Two-pane message queue: the table indexes a reading pane rather than being the destination, with a divider you drag to resize. Rows stack when the table narrows, not the window; threads read as collapsible messages; replying opens a composer that leaves the list live.',
  keywords: [
    'inbox',
    'mail',
    'email',
    'conversations',
    'thread',
    'triage',
    'reading pane',
    'split pane',
    'resize',
    'collapse',
    'compose',
    'notifications',
    'review queue',
    'approvals',
    'decisions',
  ],
  isReady: true,
  category: 'Table - Split Pane',
  icons: {
    ArchiveBoxIcon: 'archive',
    ArrowLeftIcon: 'arrowLeft',
    ArrowPathIcon: 'refresh',
    ArrowUturnLeftIcon: 'undo',
    FaceSmileIcon: 'emoji',
    FolderArrowDownIcon: 'folder',
    InboxIcon: 'inbox',
    LinkIcon: 'link',
    PaperAirplaneIcon: 'send',
    PaperClipIcon: 'attach',
    PencilSquareIcon: 'compose',
    PhotoIcon: 'image',
    TrashIcon: 'delete',
    UsersIcon: 'users',
    XMarkIcon: 'close',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top row of the LayoutHeader: Inbox heading, unread count, and the Refresh and Compose buttons.',
    },
    {
      name: 'tabs',
      kind: 'navigation',
      description:
        'Category tab strip with unread badges under the title row; a bulk-action bar replaces it while rows are selected.',
    },
    {
      name: 'messages',
      kind: 'table',
      description:
        'Scrollable LayoutContent holding the conversation table, or an empty state when the category has no conversations.',
    },
    {
      name: 'reading-pane',
      kind: 'panel',
      description:
        'Resizable end LayoutPanel after the drag handle, showing the open thread\'s collapsible messages and reply action.',
    },
  ],
};
