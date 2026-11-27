// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx postinstall`. A hidden, CLI-only command with
 * no wrapped API function (so no `fn`): it prints the setup steps on demand.
 * No package runs it at install.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'postinstall',
  displayName: 'astryx postinstall',
  namespace: 'cli/commands',
  summary: 'Print the setup steps on demand; no package runs it at install',
  description:
    'Prints a short box that names the first commands to run. It prints the setup steps ' +
    'on demand; no package runs it at install. It is hidden from help and the manifest, ' +
    'looks nothing up, and does not support --json.',
  examples: [{label: 'Print the setup steps', cli: 'astryx postinstall'}],
  outsideProject: 'same',
  exitCodes: [{code: 0, when: 'success'}],
  related: ['init'],
};
