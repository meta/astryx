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
    'Removes one page and its nav item, and rewrites the route. With no page, or for the last page, it removes the whole preview: only the files the preview wrote (theme-preview.json lists them) are deleted, and the folder only when nothing else is in it. A path in theme-preview.json that leads outside the route folder is refused before anything is deleted. Experimental: it may change or be removed in a patch release.',
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
      code: 'ERR_PATH_TRAVERSAL',
      when: 'theme-preview.json names a file outside the route folder; nothing is deleted',
    },
    {
      code: 'ERR_NOT_FOUND',
      when: 'there is no preview, or it has no such page',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'no package.json in the folder or above it',
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
