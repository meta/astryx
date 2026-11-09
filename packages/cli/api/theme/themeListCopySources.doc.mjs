// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for the released `astryx theme add --list` projection.
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeListCopySources',
  namespace: 'cli/api',
  displayName: 'themeListCopySources()',
  summary: 'List themes the source-copy form of theme add can copy.',
  description:
    'Preserves the released theme add --list result. It lists bundled and package themes with the released fields, excludes local app themes, and does not read generated app-theme state.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'themeListCopySources(options?: {cwd?: string, package?: string}): Promise<ThemeListResponse>',
  keywords: ['theme', 'add', 'list', 'copy', 'source', 'package'],
  params: [
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'Project directory whose installed integration packages contribute copyable themes.',
      default: 'process.cwd()',
    },
    {
      name: 'options.package',
      type: 'string',
      description: 'Optional exact source-selector package filter.',
    },
  ],
  returns: [
    {
      type: 'theme.list',
      description:
        'Bundled and package themes using the released slug, displayName, description, maintained, and package fields.',
    },
  ],
  throws: [
    {
      code: 'ERR_NO_SOURCE',
      when: 'the CLI bundled-theme descriptors cannot be read or parsed',
    },
  ],
  examples: [
    {
      label: 'List themes that source-copy add can copy',
      code: 'const {data} = await themeListCopySources();',
    },
    {
      label: 'List one package',
      code: "await themeListCopySources({package: '@acme/themes'});",
    },
  ],
  command: 'theme add',
  related: ['themeAdd', 'themeListAvailable', 'themeEject'],
};
