// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Kanban Board',
  displayName: 'Kanban Board',
  description:
    'Horizontal lanes of draggable cards where the column itself is the status, so drag and drop between lanes is the state change. Fixed columns, variable-height cards.',
  keywords: [
    'kanban',
    'board',
    'swimlane',
    'sprint',
    'backlog',
    'tasks',
    'pipeline',
  ],
  isReady: true,
  category: 'Tools - Kanban Board',
  icons: {
    ArrowPathIcon: 'refresh',
    ArrowsUpDownIcon: 'arrowsUpDown',
    CheckCircleIcon: 'success',
    ClipboardDocumentCheckIcon: 'clipboard',
    FunnelIcon: 'funnel',
    InboxIcon: 'inbox',
    InformationCircleIcon: 'info',
    MagnifyingGlassIcon: 'search',
    PlusIcon: 'add',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top LayoutHeader with board title, item count badge, and Toolbar of sprint selector, sort, filter, search, add-task.',
    },
    {
      name: 'board',
      kind: 'list',
      description:
        'LayoutContent body: horizontally scrolling BoardColumn lanes, one per status, holding draggable task cards or an empty state.',
    },
  ],
};
