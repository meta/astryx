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
};
