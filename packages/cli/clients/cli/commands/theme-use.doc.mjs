// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx theme use`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'theme use',
  displayName: 'astryx theme use',
  namespace: 'cli/commands',
  summary: 'Choose the app default from its added themes',
  description:
    'Sets one added slug as the default and regenerates the generated theme module. Add the theme first if it is not already in the app.',
  fn: 'themeUse',
  args: [{name: 'slug', param: 'slug', required: true}],
  examples: [{label: 'Choose the default theme', cli: 'astryx theme use ocean'}],
  outsideProject: 'refuse',
  exitCodes: [
    {code: 0, when: 'the module is regenerated with the selected default'},
    {code: 1, when: 'the theme is not added or state is invalid'},
  ],
  related: ['theme add', 'theme remove', 'theme list'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, theme use writes nothing and stops with `ERR_THEME_INVALID`: \"No package.json found. Run this command inside an app project.\" In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
};
