// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Service Monitoring Dashboard',
  displayName: 'Service Monitoring Dashboard',
  description:
    'Always-on analytics with a triage rail: status-colored tiles with sparklines, multi-series time charts over a switchable window, and an independently scrolling alert column that folds into the content when narrow.',
  keywords: [
    'monitoring',
    'uptime',
    'health',
    'latency',
    'alerting',
    'incidents',
    'observability',
    'operations',
    'live status',
    'real-time',
    'reliability',
    'traffic',
    'anomalies',
    'severity',
    'on-call',
    'oncall',
    'fleet',
    'pipelines',
    'freshness',
    'command center',
  ],
  isReady: true,
  category: 'Dashboard - Monitoring',
  icons: {
    ArrowDownIcon: 'arrowDown',
    ArrowUpIcon: 'arrowUp',
    BellAlertIcon: 'notificationActive',
    CheckCircleIcon: 'success',
    ServerStackIcon: 'server',
    StopIcon: 'stop',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top layout header with page title, live status, updated timestamp, and time-window, environment and region controls.',
    },
    {
      name: 'kpis',
      kind: 'metrics',
      description:
        'First grid in the content column: status-colored KPI tiles with sparklines.',
    },
    {
      name: 'charts',
      kind: 'chart',
      description:
        'Grid below the KPI tiles holding the multi-series latency and request-volume line charts.',
    },
    {
      name: 'uptime',
      kind: 'list',
      description:
        'Below the divider in the content column: the All services card of 90-day uptime strips per service.',
    },
    {
      name: 'alert-rail',
      kind: 'panel',
      description:
        'Right 400px scrolling panel with active alerts over the per-service breakdown; folds into content when narrow.',
    },
  ],
};
