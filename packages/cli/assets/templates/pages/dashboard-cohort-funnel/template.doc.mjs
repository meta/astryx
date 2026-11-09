// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Funnel & Cohort Dashboard',
  displayName: 'Funnel & Cohort Dashboard',
  description:
    'Analytics for sequence and retention questions, pairing two shapes a plain dashboard cannot hold: a staged funnel where each step reads as drop-off against the one before, and a two-axis cohort matrix rendered as a heatmap.',
  keywords: [
    'conversion',
    'drop-off',
    'activation',
    'churn',
    'retention reporting',
    'stages',
    'segments',
  ],
  isReady: true,
  category: 'Dashboard - Funnel & Cohort',
  icons: {
    ArrowDownIcon: 'arrowDown',
    ArrowDownTrayIcon: 'download',
    ArrowTrendingDownIcon: 'trendDown',
    ArrowUpIcon: 'arrowUp',
    StopIcon: 'stop',
  },
};
