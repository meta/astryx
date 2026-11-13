// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Side Nav',
  displayName: 'Side Nav',
  description:
    'Application frame with a single collapsible, resizable left rail carrying grouped history and search, wrapping the main content. Vertical navigation only, no top bar.',
  keywords: [
    'shell',
    'chrome',
    'layout frame',
    'sidebar',
    'drawer',
    'left rail',
    'navigation',
    'desktop app',
    'directory',
    'workspace',
  ],
  isReady: true,
  category: 'Shell - Left Sidebar',
  icons: {
    BookOpenIcon: 'book',
    BuildingOffice2Icon: 'building',
    CodeBracketIcon: 'code',
    Cog6ToothIcon: 'settings',
    MagnifyingGlassIcon: 'search',
    PlusIcon: 'add',
    SparklesIcon: 'sparkles',
    UserCircleIcon: 'userCircle',
    UserIcon: 'user',
  },
  slots: [
    {
      name: 'nav',
      kind: 'navigation',
      description:
        'Collapsible, resizable left SideNav rail with heading, menu items, grouped workspace conversations and account footer.',
    },
    {
      name: 'content',
      kind: 'main',
      description:
        'Main Layout content area right of the rail, holding the page body; here a placeholder message thread.',
    },
    {
      name: 'footer',
      kind: 'footer',
      description:
        'LayoutFooter pinned below the main content, holding a composer or bottom actions.',
    },
  ],
};
