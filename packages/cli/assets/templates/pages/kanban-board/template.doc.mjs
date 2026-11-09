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
};
