// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Top Nav',
  displayName: 'Top Nav',
  description:
    'Application frame with horizontal navigation only: a centered bar whose items open full-width mega-menu panels, over placeholder content that keeps the entire width.',
  keywords: [
    'shell',
    'chrome',
    'layout frame',
    'header',
    'menu',
    'topbar',
    'navigation',
  ],
  isReady: true,
  category: 'Shell - Top Nav',
  icons: {
    BoltIcon: 'bolt',
    CloudIcon: 'cloud',
    FaceSmileIcon: 'emoji',
    FireIcon: 'fire',
    GiftIcon: 'gift',
    GlobeAltIcon: 'globe',
    HomeModernIcon: 'home',
    MagnifyingGlassIcon: 'search',
    MoonIcon: 'moon',
    ReceiptPercentIcon: 'discount',
    ShoppingBagIcon: 'shoppingBag',
    ShoppingCartIcon: 'cart',
    SparklesIcon: 'sparkles',
    StarIcon: 'star',
    SunIcon: 'sun',
    SwatchIcon: 'swatch',
    TagIcon: 'tag',
  },
  slots: [
    {
      name: 'nav',
      kind: 'navigation',
      description:
        'Top bar with brand heading, centered mega-menu and link items, and end search, sign-in and checkout actions.',
    },
    {
      name: 'body',
      kind: 'main',
      description:
        'Centered, width-capped page body under the top nav, holding placeholder content for any page sections.',
    },
  ],
};
