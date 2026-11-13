// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Theme Showcase',
  displayName: 'Theme Showcase',
  description:
    'Multi-surface comparison shell: preview palettes, typography, icons and control states across a storefront, checkout, chat and inventory on one responsive canvas. A theme preview and design-system showcase, with an embeddable content view for an existing app shell.',
  category: 'Shell - Top Nav',
  keywords: [
    'theme',
    'tokens',
    'palette',
    'typography',
    'styling',
    'design system preview',
  ],
  isReady: true,
  // The standalone entry demonstrates an application shell; the named preview
  // composes into its host without nesting AppShell. Keep it out of the gallery.
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
    Wallet: 'wallet',
    X: 'close',
  },
  slots: [
    {
      name: 'nav',
      kind: 'navigation',
      description:
        'Top nav bar with the Studio heading, store links, and search, account, cart and sign-in buttons.',
    },
    {
      name: 'storefront',
      kind: 'content',
      description:
        'StorePreview band at the top of the body, with the store hero and product cards showing images and badges.',
    },
    {
      name: 'checkout',
      kind: 'form',
      description:
        'CheckoutCard, the left card in the first showcase row, with payment and shipping fields.',
    },
    {
      name: 'chat',
      kind: 'chat',
      description:
        'ChatCard, the right card in the first showcase row, with a message list and a composer.',
    },
    {
      name: 'inventory',
      kind: 'table',
      description:
        'InventoryCard in the lower row, with search and filters, a low-stock banner and the item table.',
    },
    {
      name: 'activity',
      kind: 'list',
      description:
        'LatestActivityCard in the narrow right column next to inventory, listing recent activity items.',
    },
  ],
};
