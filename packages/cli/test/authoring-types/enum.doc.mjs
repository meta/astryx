// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').EnumDoc} */
export const docs = {
  type: 'enum',
  name: 'widget-status',
  displayName: 'Widget status',
  description: 'Every state a widget reports.',
  members: [
    {value: 'ready', description: 'Loaded and usable.'},
    {
      value: 'stale',
      description: 'Needs a sync.',
      deprecated: 'Use needs-sync.',
    },
  ],
};
