// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Checkout Wizard',
  displayName: 'Checkout Wizard',
  description:
    'Multi-step checkout, cart, order, and payment wizard with a running summary that recalculates as answers change. It adapts to its host width, renders the summary first on narrow surfaces, validates every forward path, and completes locally without sending payment.',
  keywords: ['checkout', 'cart', 'order', 'payment'],
  isReady: true,
  category: 'Form - Checkout',
  icons: {
    CreditCardIcon: 'creditCard',
    LockClosedIcon: 'lock',
    MapPinIcon: 'location',
    ShoppingCartIcon: 'cart',
    TruckIcon: 'shipping',
  },
  slots: [
    {
      name: 'progress',
      kind: 'navigation',
      description:
        'Stepper at the top of the form column showing Cart, Shipping, Delivery and Payment steps.',
    },
    {
      name: 'step',
      kind: 'form',
      description:
        'Current step body under the stepper: cart items and promo, address fields, delivery options, or payment fields.',
    },
    {
      name: 'actions',
      kind: 'footer',
      description:
        'Back and Continue or Pay button row closing the form column, with a blocked-step message.',
    },
    {
      name: 'summary',
      kind: 'panel',
      description:
        'Sticky order summary card beside the form, collapsed above the stepper on narrow hosts; items, promo, live totals.',
    },
  ],
};
