// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for the `astryx experimental theme` group: checked theme
 * editing, the in-app preview, and experimental copies of the theme commands.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme',
  displayName: 'astryx experimental theme',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Make a theme from traits and check every edit, make and change an editor theme one checked change at a time, preview it in the app, and the experimental copies of the theme commands',
  description:
    "Themes, experimental. To make a theme, `create <name> --traits '<json>'` writes a complete theme file from a few typed traits, builds it and makes it the app's theme; the file is then yours to edit line by line, and `check <name>` after every edit lists what a person would see as broken in light and dark (`--fix` repairs it in the file). `editor` makes and changes its own themes one checked change at a time. `preview` writes a page into the app that shows the theme on real pages; with no app yet, `preview app <dir>` makes a starter app that shows it. The group also carries experimental copies of the `astryx theme` commands (compile, the copy of theme build; list, add, remove, use, eject, template, targets), with the same functions and output. Experimental: it may change or be removed in a patch release.",
  subcommands: [
    'editor',
    'preview',
    'compile',
    'check',
    'create',
    'list',
    'add',
    'remove',
    'use',
    'eject',
    'template',
    'targets',
  ],
  examples: [
    {
      label: 'Make a theme from traits',
      cli: 'astryx experimental theme create brand --traits \'{"page": "#f7f5f0", "accent": "#c2410c", "corners": 4}\'',
    },
    {
      label: 'Check it after an edit, and repair it',
      cli: 'astryx experimental theme check brand --fix',
    },
    {
      label: 'No app yet: a starter app that shows the theme',
      cli: 'astryx experimental theme preview app theme-app',
    },
    {
      label: 'Or start an editor theme, one checked change at a time',
      cli: 'astryx experimental theme editor new studio --like neutral',
    },
    {
      label: 'Round everything in the editor theme',
      cli: 'astryx experimental theme editor set studio corners pill',
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'help is shown or a subcommand succeeds',
    },
    {
      code: 1,
      when: 'an unknown subcommand, a refused change, or a subcommand failure',
    },
  ],
  related: ['theme build', 'experimental export'],
};
