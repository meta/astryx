// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file The color-set reference within Data visualization. */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export default {
  type: 'namespace',
  name: 'color-sets',
  title: 'Color sets',
  summary:
    'See existing data colors, their meanings, and examples of composed sets.',
  placement: {parent: 'namespace:visualization', slot: 'references', order: 10},
  slots: {guides: {title: 'Reference', accepts: {kinds: ['generic']}}},
};
