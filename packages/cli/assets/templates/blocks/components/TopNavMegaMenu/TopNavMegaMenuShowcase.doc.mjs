// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'TopNavMegaMenu',
  name: 'TopNavMegaMenu',
  displayName: 'Top Nav Mega Menu',
  description: 'Demonstrates TopNavMegaMenu with items and a featured card in the mega menu panel.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'TopNav',
    'TopNavMegaMenu',
    'TopNavMegaMenuItem',
    'TopNavMegaMenuFeaturedCard',
  ],
  icons: {
    BookOpenIcon: 'book',
    CodeBracketIcon: 'code',
    MagnifyingGlassIcon: 'search',
    RocketLaunchIcon: 'rocket',
    ShieldCheckIcon: 'shield',
  },
};
