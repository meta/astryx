// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const docs = {
  type: 'command',
  name: 'widget sync',
  displayName: 'astryx widget sync',
  summary: 'Copy widget assets into the app.',
  args: [{name: 'dir', description: 'Where to copy them.', required: true}],
  options: [
    {flag: '--dry-run', description: 'Show what would change.', default: false},
  ],
  examples: [{label: 'Preview', cli: 'astryx widget sync public --dry-run'}],
  exitCodes: [{code: 1, when: 'A widget asset is missing.'}],
};
