// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for the `astryx experimental` command group: the one
 * namespace for experimental CLI commands (spec:AST-017 FR27). Each
 * experiment is a subcommand of it; none is added to a stable command.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental',
  displayName: 'astryx experimental',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Try features that may change in a patch release: icon sets, one self-contained HTML file from a page built with Astryx components (not for other pages), checked theme editing',
  description:
    'The experimental command group. Every command under it is experimental: its arguments, options, output, and JSON may change or be removed in any patch release, with no deprecation period. A feature leaves this group when it becomes stable. Nothing here changes what any other command does unless you use it.',
  subcommands: ['icon', 'export', 'import', 'theme'],
  examples: [
    {label: 'List the experiments', cli: 'astryx experimental'},
    {label: 'Find an icon by meaning', cli: 'astryx experimental icon delete'},
    {
      label: 'Export a page as one HTML file',
      cli: 'astryx experimental export page.tsx',
    },
    {
      label: 'Change a theme, checked',
      cli: 'astryx experimental theme editor set brand corners pill',
    },
  ],
  exitCodes: [
    {code: 0, when: 'help is shown or a subcommand succeeds'},
    {code: 1, when: 'an unknown subcommand or a subcommand failure'},
  ],
};
