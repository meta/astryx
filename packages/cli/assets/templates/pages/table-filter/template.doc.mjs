// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Filterable Table',
  displayName: 'Filterable Table',
  description:
    'Flat row collection built around progressive filtering: a token bar that escalates into full query syntax, saved views that persist a filter set, column and grouping options, and a resizable detail pane.',
  keywords: [
    'table',
    'list',
    'rows',
    'records',
    'grid',
    'search',
    'filtered dataset',
    'searchable list',
    'filters',
    'faceted search',
    'advanced search',
    'results list',
    'explorer',
    'bulk actions',
    'badges',
    'detail drawer',
    'csv export',
  ],
  isReady: true,
  category: 'Table - Filtering',
  icons: {
    Bookmark: 'bookmark',
    BookmarkPlus: 'bookmarkAdd',
    Calendar: 'calendar',
    ChevronDown: 'chevronDown',
    CircleX: 'error',
    Columns3: 'viewColumns',
    GripVertical: 'drag',
    Image: 'image',
    Pencil: 'edit',
    Pin: 'pin',
    Plus: 'add',
    Search: 'search',
    SlidersHorizontal: 'adjustments',
    Table: 'table',
    Table2: 'group',
    UserPlus: 'userAdd',
    X: 'close',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top of the layout header: the Service jobs title with the New job primary action.',
    },
    {
      name: 'filters',
      kind: 'toolbar',
      description:
        'Row under the title: filter selectors or power search, saved views, view options, and bulk selection bar.',
    },
    {
      name: 'table',
      kind: 'table',
      description:
        'Main content area: the service jobs table with grouping, sorting, selection, empty state and infinite loading.',
    },
    {
      name: 'details',
      kind: 'panel',
      description:
        'Resizable end panel showing the clicked job\'s metadata, next action and site history.',
    },
  ],
};
