// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeRemove()` / `astryx theme remove`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeRemove',
  namespace: 'cli/api',
  displayName: 'themeRemove()',
  summary: "Remove a non-default theme from an app's generated theme module.",
  description:
    'Reads the generated module record, removes one added theme, and regenerates the whole module. The default cannot be removed until themeUse selects another added theme.',
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
        'Every remaining theme and its imports, the default slug, the generated module path, and the remove change. The default is never removed: choose another with themeUse first, which also works when the folder or package of the default is gone. Other added themes whose local folder or package is gone are left out, with a note in data.notes.',
    },
  ],
  throws: [
    {
      code: 'ERR_UNKNOWN_THEME',
      when: 'the theme is not added; the suggestion is `theme add <slug>` when a theme with that slug is available, else `theme list`',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'the theme is the default (the suggestions name `theme use` with each other added theme, or `theme list` when it is the only one) or generated state is invalid',
    },
    {code: 'ERR_WRITE_FAILED', when: 'the generated module cannot be written'},
  ],
  examples: [{label: 'Remove a theme', code: "await themeRemove('ocean');"}],
  command: 'theme remove',
  related: ['themeAdd', 'themeUse', 'themeListAvailable'],
};
