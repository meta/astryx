// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx theme add`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'theme add',
  displayName: 'astryx theme add',
  namespace: 'cli/commands',
  summary:
    "Add a built theme to the app. To copy a theme's source as an editable fork, run `theme eject <slug> [path] [--overwrite]`.",
  description:
    "Records the theme in the generated app module and imports its built module and stylesheets. --import remains accepted as a compatibility no-op. To copy a theme's source as an editable fork, run `theme eject <slug> [path] [--overwrite]`. A bare command or --list delegates to themeListCopySources(), whose released JSON bytes stay unchanged while its text names the current add and eject commands; use --package when owners share a slug. Outside a project, a bare command or --list lists the available themes as in a new project; given a slug it writes nothing and fails, naming the app project it needs (ERR_THEME_INVALID), or with ERR_UNKNOWN_THEME when no theme has that slug.",
  fn: 'themeAdd',
  args: [{name: 'slug', param: 'slug', required: false}],
  options: [
    {flag: '--list', description: 'List available themes'},
    {
      flag: '--import',
      param: 'options.import',
      description:
        'Compatibility no-op; the built theme is added with or without this flag',
    },
    {
      flag: '--package <package>',
      param: 'options.package',
      description: 'Select the package that owns the theme',
    },
  ],
  examples: [
    {
      label: 'Add a built theme to the app',
      cli: 'astryx theme add ocean',
    },
    {
      label: 'Select a package theme over a local theme',
      cli: 'astryx theme add ocean --package @acme/themes',
    },
  ],
  outsideProject: 'own',
  exitCodes: [
    {code: 0, when: 'the theme is listed or added'},
    {
      code: 1,
      when: 'the theme, its built imports, its record, or the option combination is invalid',
    },
  ],
  related: ['theme list', 'theme remove', 'theme use', 'theme eject'],
  notes: [
    {
      type: 'prose',
      text: 'In global mode: outside a project, theme add with no slug lists the themes available, as in a new project; with a slug it writes nothing and stops with `ERR_THEME_INVALID`: "No package.json found. Run this command inside an app project." In a project, the project\'s version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.',
    },
  ],
};
