// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Tree Table',
  displayName: 'Tree Table',
  description:
    'Hierarchical table where every parent row rolls up from its children — a code repository whose folders show the newest commit beneath them, beside a detail sidebar and a rendered README. Columns resize, siblings sort within their own level, arrow keys walk the rows, and search prunes the tree to matching branches.',
  keywords: [
    'tree',
    'hierarchy',
    'nested rows',
    'drilldown',
    'expand',
    'collapse',
    'resizable',
    'expandable',
    'file browser',
    'repository',
    'rolled-up parents',
  ],
  isReady: true,
  category: 'Table - Tree/Hierarchical List',
  icons: {
    BookOpen: 'book',
    ChartColumn: 'chart',
    Code: 'code',
    Eye: 'eye',
    File: 'file',
    Folder: 'folder',
    GitBranch: 'gitBranch',
    GitFork: 'gitFork',
    Scale: 'scale',
    Search: 'search',
    ShieldCheck: 'shield',
    Star: 'star',
    Tag: 'tag',
  },
};
