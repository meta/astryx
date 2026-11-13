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
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top layout header with page title, visitor summary, funnel window control, segment selector and export button.',
    },
    {
      name: 'kpis',
      kind: 'metrics',
      description:
        'Top row of the content: grid of KPI tiles showing stage conversion rates with deltas.',
    },
    {
      name: 'funnel',
      kind: 'chart',
      description:
        'First card below KPIs: conversion funnel stage bars plus a row of step drop-off rates.',
    },
    {
      name: 'trend',
      kind: 'chart',
      description:
        'Second card: conversion-over-time line chart of weekly stage rates with its series legend.',
    },
    {
      name: 'cohorts',
      kind: 'table',
      description:
        'Bottom section after the divider: weekly retention cohort heatmap table with its color legend.',
    },
  ],
};
