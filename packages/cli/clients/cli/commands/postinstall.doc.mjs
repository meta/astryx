// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx postinstall`. A hidden, CLI-only hook with no
 * wrapped API function (so no `fn`): it prints the welcome box.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'postinstall',
  displayName: 'astryx postinstall',
  namespace: 'cli/commands',
  summary: 'Print the welcome message shown after install',
  description:
    'Prints a short welcome box that names the first commands to run. It is hidden ' +
    'from help and the manifest, looks nothing up, and does not support --json.',
  examples: [{label: 'Print the welcome box', cli: 'astryx postinstall'}],
  outsideProject: 'same',
  exitCodes: [{code: 0, when: 'success'}],
  related: ['init'],
};
