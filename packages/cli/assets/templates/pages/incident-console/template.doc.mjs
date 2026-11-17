// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Incident Console',
  displayName: 'Incident Console',
  description:
    'Dense row queue with an inspector: severity-coded rows grouped by status, a search filter bar, a segmented status control, and a resizable detail pane for the selected row that opens as a bottom sheet on a phone. Rows, not cards, sized for scanning volume.',
  keywords: [
    'incident',
    'alert',
    'on-call',
    'outage',
    'ticket',
    'triage console',
  ],
  isReady: true,
  category: 'Tools - Incident Console',
  icons: {BellAlertIcon: 'notificationActive', PlusIcon: 'add'},
};
