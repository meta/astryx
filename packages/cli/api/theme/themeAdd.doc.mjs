// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeAdd()` / `astryx theme add`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeAdd',
  namespace: 'cli/api',
  displayName: 'themeAdd()',
  summary: 'Add a built theme to the app.',
  description:
    'Records a package or built local theme and regenerates the app theme module with its built module and stylesheets. options.import is an accepted compatibility no-op, as is options.overwrite set to false. Passing targetPath or options.overwrite set to true fails before writing and names themeEject, which owns source copying.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'themeAdd(slug: string, options?: {targetPath?: string, overwrite?: boolean, import?: boolean, cwd?: string, package?: string}): Promise<ThemeAppResponse>',
  keywords: ['theme', 'add', 'import', 'app', 'default', 'local'],
  params: [
    {
      name: 'slug',
      type: 'string',
      description: 'Slug of the available theme.',
      required: true,
    },
    {
      name: 'options.targetPath',
      type: 'string',
      description:
        'Removed copy destination. Passing it throws ERR_THEME_INVALID. Call themeEject instead.',
    },
    {
      name: 'options.overwrite',
      type: 'boolean',
      description:
        'False is a compatibility no-op. True throws ERR_THEME_INVALID. Call themeEject instead.',
      default: 'false',
    },
    {
      name: 'options.import',
      type: 'boolean',
      description:
        'Compatibility no-op; the built theme is added with or without this option.',
      default: 'false',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Project directory used for discovery and app-theme state.',
      default: 'process.cwd()',
    },
    {
      name: 'options.package',
      type: 'string',
      description: 'Exact owner package used to disambiguate a shared slug.',
    },
  ],
  returns: [
    {
      type: 'theme.app',
      description:
        'The complete generated-module state and add change. Its envelope package names the npm package that owns the added theme, except for a local theme.',
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
      when: 'the selected theme is invalid, targetPath is passed, or overwrite is true',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'the generated module path conflicts with an authored file',
    },
    {code: 'ERR_WRITE_FAILED', when: 'module generation fails'},
  ],
  examples: [
    {
      label: 'Add a built theme',
      code: "await themeAdd('butter');",
    },
    {
      label: 'Select a package theme over a local theme',
      code: "await themeAdd('ocean', {package: '@acme/themes'});",
    },
    {
      label: 'Keep the earlier opt-in spelling',
      code: "await themeAdd('butter', {import: true});",
    },
  ],
  command: 'theme add',
  related: ['themeRemove', 'themeUse', 'themeEject', 'themeListAvailable'],
};
