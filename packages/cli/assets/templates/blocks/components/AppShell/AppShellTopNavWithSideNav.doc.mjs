// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'AppShell',
  name: 'AppShell — Top Nav with Side Nav',
  displayName: 'AppShell — Top Nav with Side Nav',
  description:
    'The most common layout with TopNav for app identity and SideNav for page-level navigation.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'AppShell',
    'TopNav',
    'SideNav',
    'Heading',
    'Text',
    'VStack',
    'NavIcon',
  ],
  icons: {
    ChartBarIcon: 'chart',
    Cog6ToothIcon: 'settings',
    CubeIcon: 'package',
    FolderIcon: 'folder',
    HomeIcon: 'home',
    UsersIcon: 'users',
  },
};
