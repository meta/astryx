// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'theme palette',
  displayName: 'astryx theme palette',
  namespace: 'cli/commands',
  summary: 'Create and work with theme-owned color palettes',
  description:
    'Palette authoring tools. generate writes a palette candidate for you to review before a theme uses it.',
  subcommands: ['generate'],
  examples: [
    {
      label: 'Generate a candidate',
      cli: 'astryx theme palette generate palette.config.json',
    },
  ],
  exitCodes: [
    {code: 0, when: 'help is shown or a subcommand succeeds'},
    {code: 1, when: 'an unknown subcommand is provided'},
  ],
  related: ['theme build', 'theme template'],
};
