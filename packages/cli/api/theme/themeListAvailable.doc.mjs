// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for the project-aware `astryx theme list` API.
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeListAvailable',
  namespace: 'cli/api',
  displayName: 'themeListAvailable()',
  summary: 'List bundled, package, and local themes.',
  description:
    'Lists every available theme with its owner, source, added state, and default state. Descriptor-less copies left by the released theme add are not themes yet; response meta names them and the upgrade command that adds their descriptors.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'themeListAvailable(options?: {cwd?: string, package?: string}): Promise<ThemeListResponse>',
  keywords: ['theme', 'list', 'themes', 'integration', 'available', 'package'],
  params: [
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'Project directory whose installed integrations contribute themes.',
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
        'Every available theme as ThemeListEntry[], plus optional meta.unmigratedCopies entries with the source path, missing descriptor, and upgrade command. Unmigrated copies are not included in data.',
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
      label: 'List project themes',
      code: 'const {data} = await themeListAvailable();',
    },
    {
      label: 'List one package',
      code: "await themeListAvailable({package: '@acme/themes'});",
    },
  ],
  command: 'theme list',
  related: ['themeList', 'themeAdd'],
};
