// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx experimental theme list`: the experimental
 * copy of `astryx theme list`, with the same function, flags and output.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme list',
  displayName: 'astryx experimental theme list',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'List themes available to add',
  description:
    'Lists bundled, package, and local themes with their owner, source, added state, and default state. Earlier descriptor-less copies are not listed as themes; the receipt names them with the upgrade command.',
  fn: 'themeListAvailable',
  options: [
    {
      flag: '--package <package>',
      param: 'options.package',
      description: 'Show only themes owned by this package',
    },
  ],
  examples: [
    {
      label: 'List available themes',
      cli: 'astryx experimental theme list --json',
    },
    {
      label: 'List one integration package',
      cli: 'astryx experimental theme list --package @acme/themes',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {
      code: 0,
      when: 'success',
    },
    {
      code: 1,
      when: 'a bundled or installed theme descriptor cannot be read',
    },
  ],
  related: ['experimental theme add', 'experimental theme compile'],
  replaces: ['theme list'],
};
