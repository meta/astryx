// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for the synchronous bundled-theme compatibility helper.
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'listThemes',
  namespace: 'cli/api',
  displayName: 'listThemes()',
  summary: 'Read the CLI bundled-theme descriptors.',
  description:
    "Synchronously returns the themes bundled with the CLI, including each one's entry file, export name and file list. Bundled themes only; use themeListAvailable() to include themes from installed integrations.",
  importPath: '@astryxdesign/cli/api',
  signature: 'listThemes(): BundledTheme[]',
  keywords: ['theme', 'themes', 'descriptor', 'bundled', 'adapter', 'list'],
  params: [],
  returns: [
    {
      type: 'BundledTheme[]',
      description:
        'The normalized bundled descriptor entries: slug, displayName, description, maintained, entry, exportName, and files.',
    },
  ],
  throws: [
    {
      code: 'ERR_NO_SOURCE',
      when: 'the bundled descriptors are missing, invalid, or have missing source files',
    },
  ],
  examples: [
    {label: 'Read bundled entries', code: 'const themes = listThemes();'},
  ],
  related: ['themeList', 'themeAdd', 'themeBuild'],
};
