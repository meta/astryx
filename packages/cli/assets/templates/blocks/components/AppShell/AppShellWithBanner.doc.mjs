// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'AppShell',
  name: 'AppShell — With Banner',
  displayName: 'AppShell — With Banner',
  description:
    'Full layout with TopNav, SideNav, and a dismissable info banner between the nav and content.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'AppShell',
    'TopNav',
    'SideNav',
    'Banner',
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
