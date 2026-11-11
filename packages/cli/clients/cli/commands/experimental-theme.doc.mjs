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
    'Make and change a theme one checked change at a time, preview it in the app, and the experimental copies of the theme commands',
  description:
    "Themes, experimental. `editor` makes and changes a theme one checked change at a time: every change is checked against what the installed Core's components really read, and a change that cannot take effect is refused. `preview` writes a page into the app that shows the theme on real pages. The group also carries experimental copies of the `astryx theme` commands (compile, the copy of theme build; list, add, remove, use, eject, template, targets), with the same functions and output. Colors come from `editor set` (accent, neutral, success, warning, danger, info, vibrancy), which generates them, so the group has no command of its own for that. Experimental: it may change or be removed in a patch release.",
  subcommands: [
    'editor',
    'preview',
    'compile',
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
      label: 'Start a theme',
      cli: 'astryx experimental theme editor new brand --like neutral',
    },
    {
      label: 'Round everything',
      cli: 'astryx experimental theme editor set brand corners pill',
    },
    {
      label: 'See the theme and its settings',
      cli: 'astryx experimental theme editor show brand',
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
  related: ['theme build', 'experimental render'],
};
