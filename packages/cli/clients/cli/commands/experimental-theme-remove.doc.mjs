// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx experimental theme remove`: the experimental
 * copy of `astryx theme remove`, with the same function, flags and output.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme remove',
  displayName: 'astryx experimental theme remove',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'Remove a non-default theme from the app',
  description:
    'Removes one added theme from the generated module and regenerates the whole module. Choose another default with `astryx experimental theme use` before removing the current default.',
  fn: 'themeRemove',
  args: [
    {
      name: 'slug',
      param: 'slug',
      required: true,
    },
  ],
  examples: [
    {
      label: 'Remove an added theme',
      cli: 'astryx experimental theme remove ocean',
    },
  ],
  outsideProject: 'refuse',
  requires: ['themes.appModule'],
  exitCodes: [
    {
      code: 0,
      when: 'the module is regenerated without the theme',
    },
    {
      code: 1,
      when: 'the theme is not added, is the default, or state is invalid',
    },
  ],
  related: [
    'experimental theme add',
    'experimental theme use',
    'experimental theme list',
  ],
  notes: [
    {
      type: 'prose',
      text: 'In global mode: outside a project, experimental theme remove writes nothing and stops with `ERR_THEME_INVALID`: "No package.json found. Run this command inside an app project." In a project, the project\'s version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.',
    },
  ],
  replaces: ['theme remove'],
};
