// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for the `astryx theme` command group. It is a real group,
 * not a compatibility alias. Its subcommands own the work.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'theme',
  displayName: 'astryx theme',
  namespace: 'cli/commands',
  summary:
    'Add, switch, build, and author themes (to make or change one, use experimental theme editor)',
  description:
    'To make or change a theme (colors, fonts, corners, spacing, a look from a picture), use the experimental theme editor: `astryx experimental theme editor new <name> --like neutral`, then `editor set` and `editor how`; it writes and checks the theme, and `astryx theme add <name>` wires it. Look at every change with `astryx experimental theme editor show <name> --png` (takes pictures of real components): a theme change is not done until you have looked. The theme command group. Add built themes to an app, choose its default, remove them, list available and added themes, or eject source to make a local fork. The authoring commands build themes, generate palettes, write the annotated template, and list component theme targets.',
  subcommands: [
    'build',
    'list',
    'add',
    'remove',
    'use',
    'eject',
    'template',
    'palette',
    'targets',
  ],
  examples: [
    {
      label: 'Make or change a theme (the experimental theme editor)',
      cli: 'astryx experimental theme editor new brand --like neutral',
    },
    {label: 'List available and added themes', cli: 'astryx theme list'},
    {label: 'Import a theme into the app', cli: 'astryx theme add ocean'},
    {label: 'Choose the default', cli: 'astryx theme use ocean'},
    {label: 'Fork source to customize', cli: 'astryx theme eject ocean'},
    {
      label: 'Generate a palette candidate',
      cli: 'astryx theme palette generate palette.config.json',
    },
    {label: 'See what a theme can override', cli: 'astryx theme targets'},
  ],
  exitCodes: [
    {code: 0, when: 'help is shown or a subcommand succeeds'},
    {code: 1, when: 'an unknown subcommand or a subcommand failure'},
  ],
  related: ['init'],
};
