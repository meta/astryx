// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Card Grid',
  displayName: 'Card Grid',
  description:
    'Searchable, browsable card grid with filter tabs and a real empty state: uniform tiles organized by topic, narrowing in place, with no detail surface behind them.',
  keywords: [
    'catalog',
    'index',
    'directory',
    'library',
    'browse',
    'gallery of entries',
    'hub',
    'landing',
    'feed',
    'tags',
    'previews',
  ],
  isReady: true,
  category: 'Content - Card Grid',
  icons: {MagnifyingGlassIcon: 'search'},
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top layout header holding the Library page title heading.',
    },
    {
      name: 'filters',
      kind: 'toolbar',
      description:
        'Top of content: large search input over category toggle tabs with overflow menu and a sort dropdown.',
    },
    {
      name: 'empty-state',
      kind: 'feedback',
      description:
        'Centered no-results message shown below the toolbar when search and filters match nothing.',
    },
    {
      name: 'sections',
      kind: 'list',
      description:
        'Divider-separated topic sections below the toolbar, each a heading over a uniform grid of thumbnail cards.',
    },
  ],
};
