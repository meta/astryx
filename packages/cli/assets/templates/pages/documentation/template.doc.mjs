// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Documentation Catalog',
  displayName: 'Documentation Catalog',
  description:
    'Reference landing that is pure wayfinding: a banner above a grid of category cards linking into sections, with no article content on the surface itself.',
  keywords: [
    'documentation',
    'docs',
    'guide',
    'handbook',
    'reference',
    'api index',
  ],
  isReady: true,
  category: 'Content - Documentation Catalog',
  slots: [
    {
      name: 'banner',
      kind: 'header',
      description:
        'Gray card at the top with the display title, intro text, and a primary get-started button.',
    },
    {
      name: 'categories',
      kind: 'list',
      description:
        'Below the banner, headed groups of clickable category cards in a grid, each linking into a section.',
    },
  ],
};
