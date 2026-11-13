// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Grouped Table',
  displayName: 'Grouped Table',
  description:
    'Row collection bundled into collapsible sections with per-group counts, so a long list reads as a handful of blocks that expand and collapse. Query filtering and a resizable inspector for the selected row.',
  keywords: [
    'table',
    'list',
    'rows',
    'records',
    'grid',
    'grouped dataset',
    'to-do list',
    'todo',
    'priorities',
    'completed items',
    'checkboxes',
  ],
  isReady: true,
  category: 'Table - Grouped',
  icons: {
    ArrowRightIcon: 'arrowRight',
    ChartBarIcon: 'chart',
    DocumentDuplicateIcon: 'copy',
    EllipsisHorizontalIcon: 'moreHorizontal',
    PencilIcon: 'edit',
    TagIcon: 'tag',
    TrashIcon: 'delete',
    UserIcon: 'user',
    XMarkIcon: 'close',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top of LayoutHeader: the All Issues heading and the Create issue primary button.',
    },
    {
      name: 'filters',
      kind: 'toolbar',
      description:
        'Row under the heading in LayoutHeader: PowerSearch query filter and the View Options grouping popover.',
    },
    {
      name: 'table',
      kind: 'table',
      description:
        'Page body in LayoutContent: the grouped Table of issues with collapsible sections and per-group counts.',
    },
    {
      name: 'details',
      kind: 'panel',
      description:
        'Resizable end LayoutPanel showing the selected task\'s status, priority, assignee, metadata, and labels.',
    },
  ],
};
