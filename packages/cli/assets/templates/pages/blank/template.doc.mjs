// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Blank',
  displayName: 'Blank',
  description:
    'Bare scaffold: one heading slot, one empty content region, no navigation and no chrome. The starting point when every other layout imposes more structure than wanted.',
  keywords: ['blank', 'empty', 'stub', 'placeholder', 'minimal scaffold'],
  isReady: true,
  scaffold: true,
  category: 'Shell - Blank',
  slots: [
    {
      name: 'heading',
      kind: 'header',
      description:
        'Top of LayoutContent: the large Text title "New Page" that names the page.',
    },
    {
      name: 'content',
      kind: 'main',
      description:
        'The empty LayoutContent body below the heading, where the builder adds any section blocks.',
    },
  ],
};
