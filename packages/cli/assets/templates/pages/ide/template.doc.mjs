// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'IDE',
  displayName: 'IDE',
  description:
    'Dense multi-pane workspace of resizable, collapsible regions: a hierarchy tree on one flank, tabbed documents in the middle, a docked drawer along the bottom, an inspector opposite. Drag a divider to resize or collapse any of them.',
  keywords: [
    'editor',
    'ide',
    'workbench',
    'terminal',
    'development environment',
  ],
  isReady: true,
  category: 'Tools - IDE',
  icons: {
    DocumentTextIcon: 'document',
    FolderIcon: 'folder',
    MagnifyingGlassIcon: 'search',
  },
};
