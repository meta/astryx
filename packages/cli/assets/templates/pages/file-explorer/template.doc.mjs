// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'File Explorer',
  displayName: 'File Explorer',
  description:
    'Hierarchical browser that drills through nested levels as adjacent columns rather than replacing the list each time, with breadcrumb history, switchable list and grid density, and a metadata pane for the selected node.',
  keywords: ['files', 'folders', 'directory', 'tree', 'finder-style navigator'],
  isReady: true,
  category: 'Tools - File Explorer',
  icons: {
    AdjustmentsHorizontalIcon: 'adjustments',
    Bars4Icon: 'list',
    ChevronLeftIcon: 'chevronLeft',
    ChevronRightIcon: 'chevronRight',
    DocumentIcon: 'file',
    EllipsisHorizontalIcon: 'moreHorizontal',
    FolderIcon: 'folder',
    MagnifyingGlassIcon: 'search',
    ShareIcon: 'share',
    Squares2X2Icon: 'gridView',
    TableCellsIcon: 'table',
    TagIcon: 'tag',
    ViewColumnsIcon: 'viewColumns',
  },
  slots: [
    {
      name: 'toolbar',
      kind: 'toolbar',
      description:
        'Top toolbar with back/forward buttons, current folder name, view mode switch, and share, tag, search actions.',
    },
    {
      name: 'columns',
      kind: 'list',
      description:
        'Horizontally scrolling row of 240px columns, each a compact list of folders and files at one level.',
    },
    {
      name: 'details',
      kind: 'panel',
      description:
        'Detail column after the folder columns showing the selected file\'s avatar, name, kind, and information metadata.',
    },
  ],
};
