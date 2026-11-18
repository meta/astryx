// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx theme remove`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'theme remove',
  displayName: 'astryx theme remove',
  namespace: 'cli/commands',
  summary: 'Remove a theme from the app',
  description:
    'Removes one added theme from the generated module and regenerates the whole module. While other themes are added, choose another default with theme use before removing the current default. Removing the only added theme removes the module file and prints the lines the app root must drop (with the provider an installed package names as taking the theme, the props passed to it, keeping the provider); a module with changes the CLI did not write stays. A theme whose local folder or package is gone can be removed, and theme use still works when the default is the one that is gone. Removing a theme that theme add copied from a shared theme also undoes that add: the files the add wrote that still hold what it wrote go, any changed since stay and are named, and the packages it installed that no theme still in the record is owned by or imports are uninstalled, with install scripts off; the JSON carries data.undo (removed, kept, uninstalled, uninstallError).',
  fn: 'themeRemove',
  args: [{name: 'slug', param: 'slug', required: true, names: 'theme'}],
  examples: [
    {label: 'Remove an added theme', cli: 'astryx theme remove ocean'},
  ],
  outsideProject: 'refuse',
  requires: ['themes.appModule'],
  exitCodes: [
    {
      code: 0,
      when: 'the module is regenerated without the theme; or, for the only added theme, the module is removed and the lines the app root must drop are printed',
    },
    {
      code: 1,
      when: 'the theme is not added; it is the default and other themes are still added (choose another default with theme use first); it is the only added theme and its module has changes the CLI did not write; or state is invalid',
    },
  ],
  related: ['theme add', 'theme use', 'theme list'],
  notes: [
    {
      type: 'prose',
      text: 'In global mode: outside a project, theme remove writes nothing and stops with `ERR_THEME_INVALID`: "No package.json found. Run this command inside an app project." In a project, the project\'s version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.',
    },
  ],
};
