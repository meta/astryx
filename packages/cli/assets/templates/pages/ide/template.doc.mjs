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
  slots: [
    {
      name: 'explorer',
      kind: 'panel',
      description:
        'Start-side resizable panel with a file search input and a compact file tree.',
    },
    {
      name: 'editor',
      kind: 'content',
      description:
        'Center of the workspace above the bottom drawer, showing the open document as a line-numbered code block.',
    },
    {
      name: 'drawer',
      kind: 'panel',
      description:
        'Resizable drawer docked below the editor, with Terminal, Problems, Output and Debug tabs above terminal output.',
    },
    {
      name: 'inspector',
      kind: 'panel',
      description:
        'End-side resizable panel with Properties/History switch, file metadata, actions, and recent history list.',
    },
  ],
};
