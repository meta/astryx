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
    "Records the theme in the generated app module and imports its built module and stylesheets. --import remains accepted as a compatibility no-op. To copy a theme's source as an editable fork, run `theme eject <slug> [path] [--overwrite]`. A bare command or --list delegates to themeListCopySources(), whose released JSON bytes stay unchanged while its text names the current add and eject commands; use --package when owners share a slug. Outside a project, a bare command or --list lists the available themes as in a new project; given a slug it writes nothing and fails, naming the app project it needs (ERR_THEME_INVALID), or with ERR_UNKNOWN_THEME when no theme has that slug. On the first add, when an installed package names the provider that wires its themes, it says the app may already get its theme from that provider (its import module, the package that declares it, and the props it takes the theme and mode through). When that one provider takes the theme, the wiring shown passes the added theme to it in place of a Theme wrap, and a later add that first lists themeModes shows how it passes the mode; with no such prop, or two providers, it says what replacing each costs and what a Theme inside it covers above the Theme wiring. The JSON carries it as data.appProvider. Given a shared theme instead of a slug (a path to its folder, a .tgz archive of it, or an https URL to a .tgz), it copies the one theme folder in it (the folder with a typed theme descriptor) into the local themes root, src/themes/<name>, as theme eject writes a local theme; installs the @astryxdesign packages the theme imports that the app lacks with the app's package manager, at the version of the app's installed Core, with install scripts off, and says what it installed (any other package it imports is named with its install command, never installed); then records the theme as the default. Nothing of the theme runs: it is read, never imported or built, so a theme shared without its built module and stylesheet is refused. It never replaces a file it did not write: a folder of that name that another theme holds, or a shared copy with files changed since, is refused; the same shared theme added again over its own unchanged copy replaces it. An archive it cannot read, a link or a path outside the archive in it, a redirect away from https, no theme folder, or more than one are refused with the reason, writing nothing. The JSON carries the copy as data.copy (from, folder, outputDir, files, installed, installCommand, installError and installRetryCommand when the Astryx install failed, previousDefault, written: every file written, config: the module, the default and the dependencies added). theme remove of that theme undoes the add (see theme remove).",
  fn: 'themeAdd',
  args: [{name: 'slug', param: 'slug', required: false, names: 'theme'}],
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
      label: 'Add a theme someone shared as an archive',
      cli: 'astryx theme add ./ocean-theme.tgz',
    },
    {
      label: 'Select a package theme over a local theme',
      cli: 'astryx theme add ocean --package @acme/themes',
    },
  ],
  outsideProject: 'own',
  requires: ['themes.appModule'],
  exitCodes: [
    {code: 0, when: 'the theme is listed or added'},
    {
      code: 1,
      when: "the theme, its built imports, its record, a shared theme's source or name, or the option combination is invalid",
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
