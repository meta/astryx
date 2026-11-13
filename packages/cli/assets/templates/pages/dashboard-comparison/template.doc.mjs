// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Data Dashboard',
  displayName: 'Data Dashboard',
  description:
    'Comparison-heavy analytics behind a persistent filter bar: tiles that each carry an inline sparkline and several period-over-period deltas, then segmented breakdowns underneath. Every number is shown against another number.',
  keywords: [
    'dashboard',
    'metrics',
    'stats',
    'analytics',
    'trends',
    'reporting',
  ],
  isReady: true,
  category: 'Dashboard - Comparison',
  icons: {
    ArrowDownIcon: 'arrowDown',
    ArrowDownTrayIcon: 'download',
    ArrowUpIcon: 'arrowUp',
    CursorArrowRaysIcon: 'click',
    StopIcon: 'stop',
    UsersIcon: 'users',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top layout header with page title, filter summary, date/segment/device selectors, and export button.',
    },
    {
      name: 'kpis',
      kind: 'metrics',
      description:
        'Key metrics section: grid of metric cards, each with a sparkline and period-over-period deltas.',
    },
    {
      name: 'trend',
      kind: 'chart',
      description:
        'Devices section: card holding the daily active users area chart, split by device type.',
    },
    {
      name: 'breakdowns',
      kind: 'chart',
      description:
        'Audience demographics section after the divider: grid of stacked-bar breakdown cards for age, gender, device.',
    },
    {
      name: 'acquisition',
      kind: 'table',
      description:
        'Acquisition channels section at the bottom: card table of channels with users, share, and w/w change.',
    },
  ],
};
