// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Incident Console',
  displayName: 'Incident Console',
  description:
    'Dense row queue with an inspector: severity-coded rows grouped by status, a saved-search filter bar, a segmented status control, and a resizable detail pane for the selected row. Rows, not cards, sized for scanning volume.',
  keywords: [
    'incident',
    'alert',
    'on-call',
    'outage',
    'ticket',
    'triage console',
  ],
  isReady: false,
  category: 'Tools - Incident Console',
  icons: {BellAlertIcon: 'notificationActive', PlusIcon: 'add'},
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top bar with the Incidents title, investigating count, status segmented control, and Declare incident button.',
    },
    {
      name: 'search',
      kind: 'toolbar',
      description:
        'PowerSearch filter bar at the top of the content area, above the incident rows.',
    },
    {
      name: 'incidents',
      kind: 'list',
      description:
        'Scrolling incident rows grouped by status, with severity dots, state tokens, timestamps, and an empty state.',
    },
    {
      name: 'inspector',
      kind: 'panel',
      description:
        'Resizable end panel with the selected incident\'s details, actions, metadata, and timeline.',
    },
  ],
};
