// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditPreviewRemove()` / `astryx experimental theme preview remove`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditPreviewRemove',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditPreviewRemove()',
  summary: 'Remove one page from the theme preview, or the whole preview.',
  description:
    'Removes one page and its nav item, and rewrites the route. With no page, or for the last page, it removes the whole preview: only the files the preview wrote (theme-preview.json lists them) are deleted, and the folder only when nothing else is in it. Experimental: it may change or be removed in a patch release.',
  importPath: '@astryxdesign/cli/api/experimental',
  signature:
    'themeEditPreviewRemove(page?: string, options?: object): Promise<object>',
  keywords: ['theme', 'experimental theme', 'preview', 'theme preview'],
  params: [
    {
      name: 'page',
      type: 'string',
      description: 'The page to remove; none removes the whole preview.',
    },
    {
      name: 'options.path',
      type: 'string',
      description:
        'The folder of the preview route, when it is not in the default place.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The project folder.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.previewRemove',
      description: 'The files deleted and the pages left.',
    },
  ],
  throws: [
    {
      code: 'ERR_NOT_FOUND',
      when: 'there is no preview, or it has no such page',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'no package.json in the folder (without `app`)',
    },
  ],
  examples: [
    {
      label: 'One page',
      code: 'await themeEditPreviewRemove(...)',
    },
  ],
  command: 'experimental theme preview remove',
  related: ['themeEditShow'],
};
