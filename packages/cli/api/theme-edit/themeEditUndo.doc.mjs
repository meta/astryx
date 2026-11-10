// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditUndo()` / `astryx experimental theme undo`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditUndo',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditUndo()',
  summary: 'Put the theme back as it was before its last change.',
  description:
    'Steps back one change: the settings file, the theme source and the build go back to how they were before the last set, unset, or base or mode change, and the preview is rewritten. The result names what was undone and how many earlier steps are left. Experimental: it may change or be removed in a patch release.',
  importPath: '@astryxdesign/cli/api/experimental',
  signature: 'themeEditUndo(theme: string, options?: object): Promise<object>',
  keywords: [
    'theme',
    'experimental theme',
    'undo',
    'design tokens',
    'type-checked',
  ],
  params: [
    {
      name: 'theme',
      type: 'string',
      description: 'The theme name.',
      required: true,
    },
    {
      name: 'options.png',
      type: 'boolean',
      description: 'Also take PNG pictures of the preview.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The app folder.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.undo',
      description:
        'What was undone, the settings count now, the undo steps left, and the preview.',
    },
  ],
  throws: [
    {
      code: 'ERR_THEME_NOTHING_TO_UNDO',
      when: 'there is no earlier change',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: 'the theme does not exist; the suggestion is the `new` command',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: '@astryxdesign/core is not installed in the folder',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'the theme does not build (the change is undone)',
    },
    {
      code: 'ERR_RENDER_FAILED',
      when: "the components or the preview do not render with the project's React",
    },
  ],
  examples: [
    {
      label: 'Step back',
      code: 'await themeEditUndo(...)',
    },
  ],
  command: 'experimental theme undo',
  related: ['themeBuild'],
};
