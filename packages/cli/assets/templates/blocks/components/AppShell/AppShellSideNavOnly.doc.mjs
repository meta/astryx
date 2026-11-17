// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'AppShell',
  name: 'AppShell — Side Nav Only',
  displayName: 'AppShell — Side Nav Only',
  description:
    'App shell with SideNav header providing app identity, no TopNav needed.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'AppShell',
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
