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
  summary: 'Add, switch, build, and author themes',
  pointers: [
    {
      commands: ['experimental theme create', 'experimental theme check'],
      text: 'to make one, use experimental theme create --traits, then experimental theme check after every edit',
    },
  ],
  description:
    "To make a theme (colors, fonts, corners, spacing), describe the look as traits: `astryx experimental theme create <name> --traits '<json>'` writes a complete theme file (every color in light and dark), builds it and makes it the app's theme. Edit any line of that file by hand, and run `astryx experimental theme check <name> --fix` after every edit: a theme change is not done until check passes. The theme command group. Add built themes to an app, choose its default, remove them, list available and added themes, or eject source to make a local fork. The authoring commands build themes, generate palettes, write the annotated template, and list component theme targets.",
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
      label: 'Make a theme from traits (experimental theme create)',
      cli: 'astryx experimental theme create brand --traits \'{"page": "#f7f5f0", "accent": "#c2410c", "corners": 4}\'',
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
