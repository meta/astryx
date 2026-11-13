// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Executive Summary Dashboard',
  displayName: 'Executive Summary Dashboard',
  description:
    'Report-shaped analytics with a prose rail beside the charts: a scorecard of headline numbers with period deltas and status coloring, goal-attainment bars, a trend grid, and a written commentary column that folds beneath the content when narrow.',
  keywords: ['executive summary', 'business review', 'readout', 'reporting'],
  isReady: true,
  category: 'Dashboard - Scorecard',
  icons: {
    ArrowDownIcon: 'arrowDown',
    ArrowDownTrayIcon: 'download',
    ArrowRightIcon: 'arrowRight',
    ArrowUpIcon: 'arrowUp',
    StopIcon: 'stop',
  },
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top layout header with report title, period subtitle, generated timestamp, comparison period control and export button.',
    },
    {
      name: 'scorecards',
      kind: 'metrics',
      description:
        'Scorecards section in the content column: grid of six KPI tiles with period deltas and status coloring.',
    },
    {
      name: 'goals',
      kind: 'list',
      description:
        'Goal attainment section: card of OKR rows with owners and status-colored progress bars.',
    },
    {
      name: 'trends',
      kind: 'chart',
      description:
        'Trends section at the bottom of content: grid of current-vs-prior area and line chart cards.',
    },
    {
      name: 'commentary',
      kind: 'panel',
      description:
        'End-side layout panel with AI \'What changed & why\' callout cards; folds above scorecards when narrow.',
    },
  ],
};
