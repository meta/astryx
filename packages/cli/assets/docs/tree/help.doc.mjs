// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file astryx docs authoring/help — find a CLI message and its fix. */

/** @type {import('@astryxdesign/cli/authoring').NamespaceDoc} */
export const docs = {
  type: 'namespace',
  name: 'help',
  placement: {parent: 'namespace:authoring', slot: 'guides', order: 40},
  title: 'Help',
  summary: 'Find a CLI message and how to fix it.',
  keywords: ['help', 'troubleshooting', 'error'],
  slots: {
    guides: {title: 'Help', accepts: {kinds: ['generic']}},
  },
};
