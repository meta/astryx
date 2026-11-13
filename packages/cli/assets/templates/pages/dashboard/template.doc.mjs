// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Analytics Dashboard',
  displayName: 'Analytics Dashboard',
  description:
    'Three-band analytics: a row of headline tiles, then charts, then supporting tables, all re-reading from one global filter bar. Breadth over depth, a summary surface rather than a drill-down.',
  keywords: [
    'dashboard',
    'overview',
    'metrics',
    'stats',
    'analytics',
    'reporting',
    'insights',
    'kpi tiles',
    'widgets',
    'donut charts',
    'breakdowns',
    'forecasts',
  ],
  isReady: true,
  category: 'Dashboard - Analytics',
  icons: {
    ArrowDownIcon: 'arrowDown',
    ArrowPathIcon: 'refresh',
    ArrowUpIcon: 'arrowUp',
    StopIcon: 'stop',
  },
  slots: [
    {
      name: 'active-users',
      kind: 'chart',
      description:
        'Top band of the body: "Active users" heading with Reload button above a full-width line chart and legend.',
    },
    {
      name: 'kpis',
      kind: 'metrics',
      description:
        'Grid of metric cards below the chart, each with a value, change arrow and sparkline.',
    },
    {
      name: 'demographics',
      kind: 'chart',
      description:
        'Middle band after the first divider: "Demographics" heading with View more, then region and role stacked bar cards.',
    },
    {
      name: 'engagement',
      kind: 'table',
      description:
        'Bottom band after the second divider: "Engagement" heading with View more, then top pages and top events table cards.',
    },
  ],
};
