// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs visualization`: the data visualization namespace.
 * Groups guides for charts that SVG, Canvas, and configuration-driven
 * renderers draw with Astryx tokens.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'visualization',
  title: 'Data visualization',
  summary:
    'Build theme-aware charts across SVG, Canvas, and configuration-driven renderers, like Recharts, D3, and Vega-Lite.',
  keywords: [
    'charts',
    'charting',
    'graph',
    'data viz',
    'dataviz',
    'Recharts',
    'D3',
    'Vega-Lite',
    'Vega',
  ],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
    references: {title: 'Reference', accepts: {kinds: ['namespace']}},
  },
};
