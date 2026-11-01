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
};
