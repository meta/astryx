// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditPreviewList()` / `astryx experimental theme preview list`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditPreviewList',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditPreviewList()',
  summary: 'The pages of the theme preview in the app.',
  description:
    'Lists the pages of the theme preview, in nav order, with the theme they wear and the route folder. With no preview, and with no routes folder (app/ or src/app/) for one, the list is empty. A damaged theme-preview.json is refused with `ERR_THEME_INVALID`, naming the file. With no folder given and no preview in the default place, a preview recorded for a theme is listed; with several, the refusal names each. When the theme the preview wears is gone, `themeMissing` is true and `notes` names the command that switches it. Experimental: it may change or be removed in a patch release.',
  importPath: '@astryxdesign/cli/api/experimental',
  signature: 'themeEditPreviewList(options?: object): Promise<object>',
  keywords: ['theme', 'experimental theme', 'preview', 'theme preview'],
  params: [
    {
      name: 'options.path',
      type: 'string',
      description:
        'The folder of the preview route, when it is not in the default place.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'The folder to start from (default: the current directory): commands act on the Astryx project at or above it, so a subfolder of an app works.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.previewList',
      description:
        'The route folder (null with no preview), the theme, whether that theme is gone (`themeMissing`), the pages and notes.',
    },
  ],
  throws: [
    {
      code: 'ERR_THEME_INVALID',
      when: 'theme-preview.json is damaged',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'several recorded previews and none in the default place',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'no package.json in the folder or above it',
    },
  ],
  examples: [
    {
      label: 'Every page',
      code: 'await themeEditPreviewList(...)',
    },
  ],
  command: 'experimental theme preview list',
  related: ['themeEditShow'],
};
