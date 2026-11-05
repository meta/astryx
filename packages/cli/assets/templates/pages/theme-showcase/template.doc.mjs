// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Theme Showcase',
  displayName: 'Theme Showcase',
  description:
    'Several unrelated product surfaces rendered together on one canvas so a token change can be judged across contexts at once. A comparison harness rather than a layout to ship.',
  keywords: [
    'theme',
    'tokens',
    'palette',
    'typography',
    'styling',
    'design system preview',
  ],
  isReady: true,
  // Surfaced via the Themes page "Open in Playground" action, not the
  // Templates gallery, so keep it out of the overview + playground menu.
  // No `category` — it's hidden from the overview gallery (the only consumer
  // of `category`), and 'Showcase' isn't part of the TemplateCategory taxonomy.
  isHiddenFromOverview: true,
  icons: {
    Banknote: 'money',
    CreditCard: 'creditCard',
    Download: 'download',
    Folder: 'folder',
    LayoutGrid: 'apps',
    List: 'list',
    Lock: 'lock',
    MapPin: 'location',
    Mic: 'microphone',
    Plus: 'add',
    Search: 'search',
    ShoppingBag: 'shoppingBag',
    Smartphone: 'mobile',
    Tag: 'tag',
    User: 'user',
    Wallet: 'money',
    X: 'close',
  },
};
