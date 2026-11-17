// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'AppShell',
  name: 'AppShell',
  displayName: 'App Shell',
  isReady: true,
  aspectRatio: 4 / 3,
  isShowcase: true,
  description: 'A basic app shell with content padding.',
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
    CubeIcon: 'package',
    DocumentTextIcon: 'document',
    HomeIcon: 'home',
    UsersIcon: 'users',
  },
};
