// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Shell Nav',
  displayName: 'Shell Nav',
  description:
    'Application frame combining both navigation axes: a top menu bar with command-palette search over a resizable hierarchy rail, wrapping placeholder content. For when one axis is not enough.',
  keywords: [
    'shell',
    'chrome',
    'layout frame',
    'navigation',
    'sidebar',
    'menu bar',
  ],
  isReady: true,
  category: 'Shell - Top Nav + Left Sidebar',
  icons: {
    DocumentTextIcon: 'document',
    FolderIcon: 'folder',
    MagnifyingGlassIcon: 'search',
    PlayIcon: 'play',
  },
  slots: [
    {
      name: 'top-nav',
      kind: 'navigation',
      description:
        'Top menu bar with File, Edit, View dropdown menus, command-palette search field, and run and share actions.',
    },
    {
      name: 'side-nav',
      kind: 'navigation',
      description:
        'Resizable left side rail holding a compact file hierarchy tree list.',
    },
    {
      name: 'header',
      kind: 'header',
      description:
        'Layout header with a divider at the top of the body, holding placeholder editor tab cards.',
    },
    {
      name: 'content',
      kind: 'main',
      description:
        'LayoutContent body below the header, holding placeholder code-line cards; any page section fits here.',
    },
  ],
};
