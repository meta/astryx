// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Product Detail',
  displayName: 'Product Detail',
  description:
    'Single-item detail pairing a media gallery with a selection column: variant swatches, a quantity stepper, primary and secondary commit actions, and collapsible specification sections below.',
  keywords: [
    'product',
    'listing',
    'item',
    'catalog entry',
    'storefront detail',
  ],
  isReady: true,
  category: 'Content - Product Detail',
  icons: {MinusIcon: 'remove', PlusIcon: 'add', StarIcon: 'star'},
  slots: [
    {
      name: 'gallery',
      kind: 'content',
      description:
        'Left grid column: large hero image above a three-column grid of selectable thumbnail images.',
    },
    {
      name: 'summary',
      kind: 'header',
      description:
        'Top of the sticky info column: product title, star rating, price with sale badge, and description paragraph.',
    },
    {
      name: 'options',
      kind: 'form',
      description:
        'Middle of the info column: glaze and finish selectors, quantity stepper, Add to Cart and Buy it now buttons.',
    },
    {
      name: 'specs',
      kind: 'content',
      description:
        'Bottom of the info column: collapsible sections for composition, delivery and returns, and dimensions.',
    },
  ],
};
