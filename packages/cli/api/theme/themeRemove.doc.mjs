// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeRemove()` / `astryx theme remove`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeRemove',
  namespace: 'cli/api',
  displayName: 'themeRemove()',
  summary: "Remove a theme from an app's generated theme module.",
  description:
    'Reads the generated module record, removes one added theme, and regenerates the whole module. The default cannot be removed while other themes are added: themeUse selects another one first. The only added theme can be removed: that removes the module file when it is exactly what the CLI wrote.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'themeRemove(slug: string, options?: {cwd?: string}): Promise<ThemeAppResponse>',
  keywords: ['theme', 'remove', 'app', 'import', 'generated'],
  params: [
    {
      name: 'slug',
      type: 'string',
      description: 'Slug of the added theme to remove.',
      required: true,
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Project directory containing the generated theme module.',
    },
  ],
  returns: [
    {
      type: 'theme.app',
      description:
        'Every remaining theme and its imports, the default slug, the generated module path, and the remove change. While other themes are added, the default is not removed: choose another with themeUse first, which also works when the folder or package of the default is gone. Other added themes whose local folder or package is gone are left out, with a note in data.notes. When the only added theme is removed, the module file goes too: themes is empty, default is an empty string, and change.moduleRemoved is true (change.themeModes is true when that module exported themeModes). When the one provider an installed package names as the one that wires its themes takes the theme (its manifest themeProvider names themeProp), data.appProvider says how to undo that wiring: wire, the text sentence, and line, the provider opening JSX the app passes the module theme to (as theme add documents it).',
    },
  ],
  throws: [
    {
      code: 'ERR_UNKNOWN_THEME',
      when: 'the theme is not added; the suggestion is `theme add <slug>` when a theme with that slug is available, else `theme list`',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'the theme is the default and other themes are added (the suggestions name `theme use` with up to three of them), it is the only added theme and the module has changes the CLI did not write (the module stays and the message gives the steps by hand; when only its imports differ, as after a theme package upgrade, the suggestion is `theme use <slug>`, which rewrites it), generated state is invalid, or the slug is not added and names a local theme folder that is broken',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'the generated module cannot be written or removed',
    },
  ],
  examples: [{label: 'Remove a theme', code: "await themeRemove('ocean');"}],
  command: 'theme remove',
  related: ['themeAdd', 'themeUse', 'themeListAvailable'],
};
