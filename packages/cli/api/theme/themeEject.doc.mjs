// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `themeEject()` / `astryx theme eject`.
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEject',
  namespace: 'cli/api',
  displayName: 'themeEject()',
  summary: 'Eject an available theme into a project as editable source.',
  description:
    "Resolves a theme from the CLI bundle or an installed integration and ejects it into the consumer project: a bundled theme's source files, or an integration theme's complete directory with its descriptor. Writes are staged and existing files require explicit overwrite. Duplicate slugs fail closed until the caller selects an owner package.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'themeEject(slug: string, options?: {targetPath?: string, overwrite?: boolean, cwd?: string, package?: string}): Promise<ThemeEjectResponse>',
  keywords: ['theme', 'eject', 'integration', 'scaffold', 'copy', 'extract'],
  params: [
    {
      name: 'slug',
      type: 'string',
      description:
        'Slug of the available theme to eject (matched case-insensitively).',
      required: true,
    },
    {
      name: 'options.targetPath',
      type: 'string',
      description:
        'Destination directory for ejected files. Must resolve within cwd.',
      default: "'src/themes/<slug>'",
    },
    {
      name: 'options.overwrite',
      type: 'boolean',
      description: 'Replace existing files instead of refusing.',
      default: 'false',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'Project directory used for integration discovery and target paths.',
    },
    {
      name: 'options.package',
      type: 'string',
      description:
        'Exact source-selector package used to disambiguate a shared slug. Bundled themes retain @astryxdesign/cli.',
    },
  ],
  returns: [
    {
      type: 'theme.eject',
      description:
        'Eject receipt with slug, displayName, the source theme maintained flag, source-selector package, outputDir, entry, exportName, and files. The written local descriptor always uses maintained: false.',
    },
  ],
  throws: [
    {
      code: 'ERR_UNKNOWN_THEME',
      when: 'no available theme matches the slug and package',
    },
    {code: 'ERR_AMBIGUOUS_THEME', when: 'more than one package owns the slug'},
    {
      code: 'ERR_THEME_INVALID',
      when: 'the selected installed package has a blocking integration or theme-descriptor error',
    },
    {code: 'ERR_PATH_TRAVERSAL', when: 'the target path escapes cwd'},
    {code: 'ERR_NO_SOURCE', when: 'a theme file to eject is missing'},
    {
      code: 'ERR_FILE_EXISTS',
      when: 'a destination exists and overwrite is not set',
    },
    {code: 'ERR_WRITE_FAILED', when: 'writing files fails'},
  ],
  examples: [
    {label: 'Eject a bundled theme', code: "await themeEject('ocean');"},
    {
      label: 'Eject an integration theme',
      code: "await themeEject('ocean', {package: '@acme/themes'});",
    },
  ],
  command: 'theme eject',
  related: ['themeAdd', 'themeRemove', 'themeUse', 'themeList', 'listThemes'],
};
