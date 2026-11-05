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
        'Every remaining theme and its imports, the default slug, the generated module path, and the remove change.',
    },
  ],
  throws: [
    {code: 'ERR_UNKNOWN_THEME', when: 'the theme is not added'},
    {
      code: 'ERR_THEME_INVALID',
      when: 'the theme is the default or generated state is invalid',
    },
    {code: 'ERR_WRITE_FAILED', when: 'the generated module cannot be written'},
  ],
  examples: [{label: 'Remove a theme', code: "await themeRemove('ocean');"}],
  command: 'theme remove',
  related: ['themeAdd', 'themeUse', 'themeListAvailable'],
};
