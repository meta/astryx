// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'page',
  name: 'Portfolio Dashboard',
  displayName: 'Portfolio Dashboard',
  description:
    'Analytics for a value-over-time question: balance and change tiles above a stacked area chart of composition through time, closing on a ranked table of the largest contributors.',
  keywords: [
    'portfolio',
    'holdings',
    'positions',
    'returns',
    'allocation',
    'investments',
    'performance reporting',
  ],
  isReady: true,
  category: 'Dashboard - Portfolio',
  icons: {ArrowDownIcon: 'arrowDown', ArrowUpIcon: 'arrowUp'},
  slots: [
    {
      name: 'header',
      kind: 'header',
      description:
        'Top row with the My Portfolio title and the time-range dropdown menu.',
    },
    {
      name: 'kpis',
      kind: 'metrics',
      description:
        'Grid of metric cards below the header: total value, annual return, dividend yield and holdings.',
    },
    {
      name: 'chart',
      kind: 'chart',
      description:
        'Wide three-column card left of top assets, holding the Portfolio Value area chart over time.',
    },
    {
      name: 'top-assets',
      kind: 'list',
      description:
        'Narrow card right of the chart listing top holdings with avatars, values and change badges.',
    },
    {
      name: 'markets',
      kind: 'list',
      description:
        'Below the divider, the Market Today heading and grid of market index sparkline cards.',
    },
    {
      name: 'trending',
      kind: 'table',
      description:
        'Final card at the page bottom with the Trending Stocks table of prices, changes and sparklines.',
    },
  ],
};
