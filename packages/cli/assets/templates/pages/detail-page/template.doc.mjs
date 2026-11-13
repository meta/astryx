// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Order Detail',
  displayName: 'Order Detail',
  description: 'Single-record detail in two columns: a summary header with status and actions, a repeating line-item list, a totals block that sums it, and a chronological activity timeline in the rail. The shape for any record holding children plus a history: a customer order with shipping, an invoice, a transaction, or a job.',
  keywords: [
    'order',
    'invoice',
    'transaction',
    'job',
    'record detail',
    'summary header',
  ],
  isReady: true,
  category: 'Content - Order Detail',
  icons: {
    ArrowLeftIcon: 'arrowLeft',
    CalendarIcon: 'calendar',
    FlagIcon: 'flag',
    FunnelIcon: 'funnel',
    HandThumbUpIcon: 'thumbsUp',
    HeartIcon: 'heart',
    PencilSquareIcon: 'compose',
    ViewColumnsIcon: 'viewColumns',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top page header with back link, order number, status metadata, Restock and Edit actions, and view tabs.',
    },
    {
      name: 'items',
      kind: 'list',
      description:
        'First body section listing the order\'s line items with thumbnails, details, prices, and fulfillment actions.',
    },
    {
      name: 'invoice',
      kind: 'content',
      description:
        'Body section below items showing subtotal, discount, shipping, tax, total, and payment metadata.',
    },
    {
      name: 'timeline',
      kind: 'list',
      description:
        'Last body section with a chronological activity feed of events, comments, and updates.',
    },
    {
      name: 'details',
      kind: 'panel',
      description:
        'Right side panel with collapsible notes, customer info, and fraud analysis; hideable from the header.',
    },
  ],
};
