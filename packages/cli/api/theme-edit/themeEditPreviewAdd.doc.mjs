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
    "Writes the theme preview into the app: one route, a normal page of the app that keeps its layout, global CSS and providers, in an app shell with a side nav item per preview page and a top bar with the theme name and, when it wears a theme made by `editor`, a light, dark and system switch. A description (\"a sales dashboard\") asks the same page ranking `build` uses for the template pages that fit it best (`top` of them, default 1), and adds each as a page, saying in `matched` what it picked and why (the words of the description it covers). App frames (the Shell templates) are left out, since the preview is an app shell already. When no page is exactly the one described, the closest is added and `matched` says the rest of the description is not on it; only a description no page relates to is refused, writing nothing and naming the closest pages to add with `template`, with the other options repeated. A page the app cannot show (a missing package, or StyleX without a compiler) is skipped and the next match is taken (from the ranking, then the template search), and the result says so. A page's nav label is its template's display name, however it was added; `template` names one page template instead; with neither, it adds the default pages: Overview (the theme at a glance, built to show what themes most often break: long and short text, every text level on every surface, every button variant and size with disabled and loading, inputs in their states, selected navigation, status colors, a table, open layers), Components (every component grouped, each with the command that changes it most) and, when the theme sets a color, Colors (each color's shades in light and dark, with the shade number, the hex and the tokens that use each; it reads the theme's generated colors, so it changes with every `editor set`). The route goes in theme-preview/ in the app's routes folder (app/ or src/app/), or in `path`; the first add records the pages and the files it wrote in theme-preview.json beside the route, so later calls find it. With no routes folder and no `path`, it refuses and names both ways on: `path`, or `themeEditPreviewApp`, which makes a new starter app with the preview in it. The route fills the whole window with the theme, shell and edges included. Every check (the theme, the template, the ranking and every file it writes) runs before the first write, so a refusal changes nothing. A template page that imports a package the app lacks, or that uses StyleX in an app with no StyleX compiler, is not added: the result lists it in `skipped`, with the command that installs what it needs. A file the preview did not write is never replaced. The pages wear `theme` (default: the only theme under themes/; with none or several, the app's own theme). The pages go in _pages/ beside the route, a folder Next never serves as a route; a preview an older release wrote into pages/ is moved there. theme-preview.json records a hash of each file the preview writes: a file changed by hand since is never replaced (the refusal names it), and a page file that already holds exactly the planned text is taken over. The files are staged and renamed into place together; when a write fails, every file is put back as it was. A damaged theme-preview.json is refused with `ERR_THEME_INVALID`, naming the file. The folder is refused when it is a file, in themes/ or node_modules/, in a Pages Router folder (pages/ or src/pages/), in a folder Next does not route (_private, @slot, [param]), or written with Windows separators, a leading ~ or white space at either end. With no `path` and no preview in the default place, a preview recorded for a theme is used; with several, the refusal names each. A theme the preview wore that is gone is replaced by the app's own theme, with a note; a changed theme writes the default pages again. A template page whose package the app's package.json names but nobody installed is skipped like a missing one. Only the first 40 different words of a long description go to the ranking, with a note. The project root, src/ and the routes folder itself are refused too: they hold the app. An older preview found there is named, with the remove that clears it. A recorded page whose file is gone is written again (a default page, or the template its id names), or else left out of the nav, with a note. A formatter run (white space, quotes, semicolons, commas) does not count as a change by hand. Refusals never suggest deleting files: they say what to move or rename. Preview commands in one project run one after another. The folder is also refused when it holds a package.json, when another page of the app already serves its URL (a route group or the Pages Router), when next.config sets pageExtensions without tsx, when it is in src/app/ while app/ is what Next serves, and when no root layout is above it (an app with its root layout in [locale]/ gets its preview there, opened at /<locale>/theme-preview; an app with a root layout in each route group takes the preview under any of them). A template's needs come from its real import statements, never words in comments or strings; a package the app does not name gets the command that adds it. A theme with no build is built only after every check passed, holding that theme's lock, with a note. An edit inside a string counts as a change by hand; a formatter run does not. Experimental: it may change or be removed in a patch release.",
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
      name: 'options.cwd',
      type: 'string',
      description:
        'The folder to start from (default: the current directory): commands act on the Astryx project at or above it, so a subfolder of an app works.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.previewAdd',
      description:
        'The route folder, the theme, the pages added, the template pages skipped for missing packages, every page, the files written, and how to open the preview.',
    },
  ],
  throws: [
    {
      code: 'ERR_NOT_FOUND',
      when: 'no routes folder and no `path`, or no page template to show',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'a file there that the preview did not write, or one it wrote and someone changed since',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: '`path` is outside the project, or a file it writes leads outside the route folder through a link',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'a description with `template`, an empty `template`, `top` other than 1, 2 or 3 as typed or with no description, or a folder that is no place for the preview',
    },
    {
      code: 'ERR_DEP_MISSING',
      when: 'every template page asked for imports a package the app lacks or needs a StyleX compiler it lacks; the suggestion is the install command',
    },
    {
      code: 'ERR_UNKNOWN_TEMPLATE',
      when: '`template` names no page template (a block is named as one), with the closest page templates as commands',
    },
    {
      code: 'ERR_THEME_LOAD',
      when: 'the theme the pages wear has no build and does not build; nothing is written',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: '`theme` names a theme this command did not make',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'theme-preview.json is damaged, or the theme does not load; nothing is written',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'a write failed; every file is put back as it was',
    },
    {
      code: 'ERR_THEME_BUSY',
      when: 'another preview command in the project did not finish within 30 seconds; nothing is changed',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'no package.json in the folder or above it',
    },
  ],
  examples: [
    {
      label: 'Default pages',
      code: 'await themeEditPreviewAdd(...)',
    },
  ],
  command: 'experimental theme preview add',
  related: ['themeEditShow', 'themeEditPreviewApp'],
};
