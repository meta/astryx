// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Checkout Form',
  displayName: 'Checkout Form',
  description:
    'Long sectioned form running beside a summary that stays visible while the fields scroll and recalculates as they change, ending on a terminal confirm of the total. Sections run contact, address, delivery choice, then card details.',
  keywords: ['checkout', 'payment', 'billing', 'cart', 'buyer', 'purchase'],
  isReady: true,
  category: 'Form - Checkout',
  icons: {
    CheckCircleIcon: 'success',
    LockClosedIcon: 'lock',
    ShieldCheckIcon: 'shield',
    TruckIcon: 'shipping',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top of the centered section: page title, secure-checkout note, and a divider.',
    },
    {
      name: 'fields',
      kind: 'form',
      description:
        'Left column of form sections: sign-in, contact, shipping, delivery, payment, billing, promo and gift.',
    },
    {
      name: 'footer',
      kind: 'footer',
      description:
        'Bottom of the form column: trust badges, Place Order and Continue Shopping buttons, policy links.',
    },
    {
      name: 'summary',
      kind: 'panel',
      description:
        'Sticky right-column card: collapsible order summary with line items, totals and free-shipping banner.',
    },
  ],
};
