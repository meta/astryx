// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Not Found',
  displayName: 'Not Found',
  description:
    'Recovery page for a broken or mistyped link that matches no route: a centered message with a "Go to home" button, plus a live search box that filters a list of the app\'s main destinations by name or description and shows a no-match line when nothing fits.',
  keywords: [
    '404',
    'dead link recovery',
    'missing route',
    'dead link',
    'search destinations',
    'filter destinations',
    'back to home',
  ],
  isReady: false,
  category: 'Status - Not Found',
  icons: {
    ChartBarIcon: 'chart',
    Cog6ToothIcon: 'settings',
    FolderIcon: 'folder',
    MagnifyingGlassIcon: 'search',
    MapIcon: 'location',
    QuestionMarkCircleIcon: 'info',
    UsersIcon: 'users',
  },
};
