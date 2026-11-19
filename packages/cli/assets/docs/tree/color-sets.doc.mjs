// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file The color-set reference within Data visualization. */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export default {
  type: 'namespace',
  name: 'color-sets',
  title: 'Colors',
  summary: 'Choose colors for your data, labels, axes, grids, and tooltips.',
  placement: {parent: 'namespace:visualization', slot: 'references', order: 10},
  slots: {guides: {title: 'Reference', accepts: {kinds: ['generic']}}},
};
