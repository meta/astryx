// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file `astryx docs visualization`: public guides for building charts and
 * other data visualizations with Astryx.
 */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'visualization',
  placement: {parent: 'namespace:cli', slot: 'guides', order: 70},
  title: 'Data visualization',
  summary:
    'Build accessible, theme-aware charts across SVG, Canvas, and configuration-driven renderers.',
  keywords: ['chart', 'data visualization', 'graph', 'renderer'],
  slots: {
    guides: {title: 'Guides', accepts: {kinds: ['generic']}},
  },
};
