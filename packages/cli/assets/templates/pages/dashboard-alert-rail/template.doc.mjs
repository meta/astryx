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
};
