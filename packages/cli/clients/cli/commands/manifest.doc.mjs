// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx manifest`. A CLI-only capability manifest with no
 * wrapped API function (so no `fn`); it emits the full command surface — args,
 * flags, subcommands, and JSON response types, as a single typed envelope.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'manifest',
  displayName: 'astryx manifest',
  namespace: 'cli/commands',
  summary: 'Print the full CLI capability manifest (use with --json)',
  description:
    'Emits the complete CLI surface: every command with its arguments, options, ' +
    'subcommands, and JSON response types, as a single typed envelope for agents and ' +
    'tooling to introspect. Intended to be run with --json.',
  examples: [
    {label: 'Full manifest', cli: 'astryx manifest --json'},
    {label: 'The same manifest, under data.manifest (type "help")', cli: 'astryx --json'},
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success'},
    {code: 1, when: 'the manifest cannot be generated'},
  ],
  related: ['docs', 'discover', 'search'],
};
