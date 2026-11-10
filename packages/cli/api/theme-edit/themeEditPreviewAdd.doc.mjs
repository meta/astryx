// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditPreviewAdd()` / `astryx experimental theme preview add`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditPreviewAdd',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditPreviewAdd()',
  summary:
    'Add pages to the theme preview in the app: the default pages, the best template pages for a description, or one template.',
  description:
    "Writes the theme preview into the app: one route, a normal page of the app that keeps its layout, global CSS and providers, in an app shell with a side nav item per preview page and a top bar with the theme name and a light, dark and system switch. A description (\"a sales dashboard\") asks the same page ranking `build` uses for the template pages that fit it best (`top` of them, default 1), and adds each as a page; `template` names one page template instead; with neither, it adds the default pages: the sample app page and every component grouped. The route goes in theme-preview/ in the app's routes folder (app/ or src/app/), or in `path`; the first add records the pages and the files it wrote in theme-preview.json beside the route, so later calls find it. With no routes folder and no `path`, it refuses and names both ways on. `app` makes a new starter app in that folder instead (Next.js app router, Core and the neutral theme, with the Astryx packages pinned to this CLI's release) with the route in it; no install runs. A file the preview did not write is never replaced. The pages wear `theme` (default: the only theme under themes/; with none or several, the app's own theme). Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api/experimental',
  signature:
    'themeEditPreviewAdd(description?: string, options?: object): Promise<object>',
  keywords: ['theme', 'experimental theme', 'preview', 'theme preview'],
  params: [
    {
      name: 'description',
      type: 'string',
      description:
        'What the page is for; the build ranking picks the template pages that fit it.',
    },
    {
      name: 'options.theme',
      type: 'string',
      description: 'The theme the pages wear.',
    },
    {
      name: 'options.template',
      type: 'string',
      description: 'Add this page template instead of ranking one.',
    },
    {
      name: 'options.top',
      type: 'number',
      description:
        'With a description: how many template pages, 1 to 3 (default 1).',
    },
    {
      name: 'options.path',
      type: 'string',
      description: 'The folder of the preview route, inside the project.',
    },
    {
      name: 'options.app',
      type: 'string',
      description:
        'Make a new starter app in this folder, with the preview in it.',
    },
    {
      name: 'options.overwrite',
      type: 'boolean',
      description: 'With `app`: write into a folder that is not empty.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The project folder.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.previewAdd',
      description:
        'The route folder, the theme, the pages added and every page, the files written, a new app and its files, and how to open the preview.',
    },
  ],
  throws: [
    {
      code: 'ERR_NOT_FOUND',
      when: 'no routes folder and neither `path` nor `app`, or no page template to show',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'a file there that the preview did not write, or `app` names a folder that is not empty (without `overwrite`)',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: '`path` or `app` is outside the current folder',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'a description with `template`, `path` with `app`, or `top` outside 1 to 3',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: '`theme` names a theme this command did not make',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'no package.json in the folder (without `app`)',
    },
  ],
  examples: [
    {
      label: 'Default pages',
      code: 'await themeEditPreviewAdd(...)',
    },
  ],
  command: 'experimental theme preview add',
  related: ['themeEditShow'],
};
