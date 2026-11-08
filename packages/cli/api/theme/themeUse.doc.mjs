// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeUse()` / `astryx theme use`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeUse',
  namespace: 'cli/api',
  displayName: 'themeUse()',
  summary: "Choose an app's default added theme.",
  description:
    'Reads the generated module record, selects one added slug as the default, and regenerates the whole module. The command does not add a missing theme.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'themeUse(slug: string, options?: {cwd?: string}): Promise<ThemeAppResponse>',
  keywords: ['theme', 'use', 'default', 'app', 'generated'],
  params: [
    {
      name: 'slug',
      type: 'string',
      description: 'Slug of the added theme to make default.',
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
        'Every added theme and its imports, the selected default, the generated module path, and the use change.',
    },
  ],
  throws: [
    {code: 'ERR_UNKNOWN_THEME', when: 'the theme is not added'},
    {code: 'ERR_THEME_INVALID', when: 'generated state is invalid'},
    {code: 'ERR_WRITE_FAILED', when: 'the generated module cannot be written'},
  ],
  examples: [{label: 'Choose the default', code: "await themeUse('ocean');"}],
  command: 'theme use',
  related: ['themeAdd', 'themeRemove', 'themeListAvailable'],
};
