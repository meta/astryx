// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Settings Form',
  displayName: 'Settings Form',
  description:
    'Preferences as one continuously scrolling form, sections stacked in order with no navigation between them. The simplest settings shape: everything reachable by scrolling.',
  keywords: ['settings', 'preferences', 'configuration', 'options', 'account'],
  isReady: true,
  category: 'Settings - Form',
  icons: {MagnifyingGlassIcon: 'search'},
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top layout header with the Settings title and a search typeahead for finding settings.',
    },
    {
      name: 'nav',
      kind: 'navigation',
      description:
        'Start side panel list of settings categories; becomes a tab bar above content on narrow screens.',
    },
    {
      name: 'sections',
      kind: 'form',
      description:
        'Main content of stacked form sections, each a heading and description beside fields and a Save button.',
    },
  ],
};
