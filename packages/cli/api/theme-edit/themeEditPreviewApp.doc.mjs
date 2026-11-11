// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditPreviewApp()` / `astryx experimental theme preview app`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditPreviewApp',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditPreviewApp()',
  summary: 'Make a new starter app with the theme preview inside.',
  description:
    "Writes a new starter app into `dir` (Next.js app router, Core and the neutral theme, with the Astryx packages pinned to this CLI's release), with the theme preview route and its default pages (the sample app page and every component grouped) in src/app/theme-preview/. With `theme`, the theme folder is copied into the app's themes/ and the pages wear it; a base theme or font package it needs is added to package.json. No install runs: the result says how to install, run and open it. `dir` must be new or empty, inside the current folder; with `overwrite`, a folder that is not empty is used, a protected file there is refused, and its own package.json and .gitignore are kept. Every check runs before the first write, so a refusal changes nothing. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api/experimental',
  signature:
    'themeEditPreviewApp(dir: string, options?: object): Promise<object>',
  keywords: [
    'theme',
    'experimental theme',
    'preview',
    'starter app',
    'next.js',
  ],
  params: [
    {
      name: 'dir',
      type: 'string',
      description:
        'The folder for the new app: new or empty, inside the current folder.',
      required: true,
    },
    {
      name: 'options.theme',
      type: 'string',
      description:
        "A theme made by `experimental theme editor` here: copied into the app, and the pages wear it (default: the app's own neutral theme).",
    },
    {
      name: 'options.overwrite',
      type: 'boolean',
      description: 'Write into a folder that is not empty.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The folder the app folder is inside.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.previewApp',
      description:
        'The app folder, the theme the pages wear, the pages, the files written, notes, and how to install, run and open it.',
    },
  ],
  throws: [
    {
      code: 'ERR_FILE_EXISTS',
      when: '`dir` is not empty (without `overwrite`), or a protected file is in it (with `overwrite`)',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: '`dir` is outside the current folder, or a file it writes leads outside it through a link',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: '`theme` names a theme this command did not make',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'no `dir`',
    },
  ],
  examples: [
    {
      label: 'A new app',
      code: "await themeEditPreviewApp('theme-app')",
    },
  ],
  command: 'experimental theme preview app',
  related: ['themeEditPreviewAdd'],
};
