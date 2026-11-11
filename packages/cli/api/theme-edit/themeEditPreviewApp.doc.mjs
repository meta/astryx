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
    "Writes a new starter app into `dir` (Next.js app router, Core and the neutral theme, with the Astryx packages pinned to this CLI's release), with the theme preview route and its default pages (the sample app page and every component grouped) in src/app/theme-preview/. With `theme`, the theme folder is copied into the app's themes/ and the pages wear it; a base theme or font package it needs is added to package.json. No install runs: the result says how to install, run and open it. `dir` must be new or empty, inside the current folder; a folder that is not empty is refused, with a free folder name to use instead. Every check runs before the first write, so a refusal changes nothing. Every open font the theme names is added to package.json, at the version this project has or a pinned range, and the route imports it; a theme with generated colors gets the Colors page too, and a one-mode theme starts the route in its mode. The app is written into a temp folder beside the folder and moved into place, so a failure leaves nothing behind. A folder holding only .git, .DS_Store or Thumbs.db counts as empty. The folder is refused when it is a file, a dangling link, inside this app's routes folder, themes/ or node_modules/, or written with Windows separators, white space at either end or a name too long. A theme whose build is missing or older than its settings is built first, with a note. The app's home page links to the preview, and its .gitignore leaves out node_modules, next-env.d.ts and *.tsbuildinfo. Inside a project with a tsconfig.json, a note says to exclude the new folder. With a theme, it holds that theme's lock while it builds and copies it, so an `editor set` on the same theme waits for it. A folder given from a subfolder of the project is taken from where it was given. Experimental: it may change or be removed in a patch release.",
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
      when: '`dir` is not empty, is a file or a dangling link, or was filled while the app was written',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: '`dir` is outside the current folder, or a file it writes leads outside it through a link',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: '`theme` names a theme `experimental theme editor` did not make; the closest editor theme is named, and for a package theme what to do instead',
    },
    {
      code: 'ERR_THEME_BUSY',
      when: 'another command changing the theme did not finish within 30 seconds; nothing is written',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'no `dir`, or a folder that is no place for an app',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'a write failed; nothing is left behind',
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
