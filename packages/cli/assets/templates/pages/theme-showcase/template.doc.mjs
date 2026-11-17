// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Theme Showcase',
  displayName: 'Theme Showcase',
  description:
    'Multi-surface comparison shell: sample product screens (a storefront with an account dialog, checkout, chat, activity and inventory) rendered in the active theme on one responsive canvas. A theme preview and design-system showcase, with an embeddable content view for an existing app shell.',
  category: 'Shell - Top Nav',
  keywords: ['theme', 'styling', 'design system', 'preview'],
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
};
