// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme preview add`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme preview add',
  displayName: 'astryx experimental theme preview add',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Add pages to the theme preview in the app: the default pages, the best template pages for a description, or one template',
  description:
    "Writes the theme preview into the app: one route, a normal page of the app that keeps its layout, global CSS and providers, in an app shell with a side nav item per preview page and a top bar with the theme name and, when it wears a theme made by `editor`, a light, dark and system switch. A description (\"a sales dashboard\") asks the same page ranking `build` uses for the template pages that fit it best (--top of them, default 1), and adds each as a page, saying in `matched` what it picked and why (the words of the description it covers). App frames (the Shell templates) are left out, since the preview is an app shell already. When no page is exactly the one described, the closest is added and `matched` says the rest of the description is not on it; only a description no page relates to is refused, writing nothing and naming the closest pages to add with --template, with the other options repeated. A page the app cannot show (a missing package, or StyleX without a compiler) is skipped and the next match is taken (from the ranking, then the template search), and the result says so. A page's nav label is its template's display name, however it was added; --template names one page template instead; with neither, it adds the default pages: Overview (the theme at a glance, built to show what themes most often break: long and short text, every text level on every surface, every button variant and size with disabled and loading, inputs in their states, selected navigation, status colors, a table, open layers), Components (every component grouped, each with the command that changes it most) and, when the theme sets a color, Colors (each color's shades in light and dark, with the shade number, the hex and the tokens that use each; it reads the theme's generated colors, so it changes with every `editor set`). The route goes in theme-preview/ in the app's routes folder (app/ or src/app/), or in --path; the first add records the pages and the files it wrote in theme-preview.json beside the route, so later calls find it. With no routes folder and no --path, it refuses and names both ways on: --path, or `experimental theme preview app <dir>`, which makes a new starter app with the preview in it. The route fills the whole window with the theme, shell and edges included. Every check (the theme, the template, the ranking and every file it writes) runs before the first write, so a refusal changes nothing. A template page that imports a package the app lacks, or that uses StyleX in an app with no StyleX compiler, is not added: the result names it and the command that installs what it needs. A file the preview did not write is never replaced. The pages wear --theme (default: the only theme under themes/; with none or several, the app's own theme). The pages go in _pages/ beside the route, a folder Next never serves as a route; a preview an older release wrote into pages/ is moved there. theme-preview.json records a hash of each file the preview writes: a file changed by hand since is never replaced (the refusal names it), and a page file that already holds exactly the planned text is taken over. The files are staged and renamed into place together; when a write fails, every file is put back as it was. A damaged theme-preview.json is refused with `ERR_THEME_INVALID`, naming the file. The folder is refused when it is a file, in themes/ or node_modules/, in a Pages Router folder (pages/ or src/pages/), in a folder Next does not route (_private, @slot, [param]), or written with Windows separators, a leading ~ or white space at either end. With no --path and no preview in the default place, a preview recorded for a theme is used; with several, the refusal names each. A theme the preview wore that is gone is replaced by the app's own theme, with a note; a changed theme writes the default pages again. A template page whose package the app's package.json names but nobody installed is skipped like a missing one. Only the first 40 different words of a long description go to the ranking, with a note. The description may be several words without quotes. The project root, src/ and the routes folder itself are refused too: they hold the app. An older preview found there is named, with the remove that clears it. A recorded page whose file is gone is written again (a default page, or the template its id names), or else left out of the nav, with a note. A formatter run (white space, quotes, semicolons, commas) does not count as a change by hand. Refusals never suggest deleting files: they say what to move or rename. Preview commands in one project run one after another. The folder is also refused when it holds a package.json, when another page of the app already serves its URL (a route group or the Pages Router), when next.config sets pageExtensions without tsx, when it is in src/app/ while app/ is what Next serves, and when no root layout is above it (an app with its root layout in [locale]/ gets its preview there, opened at /<locale>/theme-preview; an app with a root layout in each route group takes the preview under any of them). A template's needs come from its real import statements, never words in comments or strings; a package the app does not name gets the command that adds it. A theme with no build is built only after every check passed, holding that theme's lock, with a note. An edit inside a string counts as a change by hand; a formatter run does not. Experimental: it may change or be removed in a patch release.",
  fn: 'themeEditPreviewAdd',
  args: [
    {
      name: 'description',
      param: 'description',
      required: false,
      variadic: true,
    },
  ],
  options: [
    {
      flag: '--theme <name>',
      param: 'options.theme',
      description:
        "The theme the pages wear: a theme made by experimental theme editor (default: the only one under themes/; with none or several, the app's own theme)",
    },
    {
      flag: '--template <id>',
      param: 'options.template',
      description:
        'Add this page template (astryx template --list --type page) instead of ranking one from a description',
    },
    {
      flag: '--top <n>',
      param: 'options.top',
      description:
        'With a description: how many of the best-fitting page templates to add, 1 to 3 (default 1)',
    },
    {
      flag: '--path <dir>',
      param: 'options.path',
      description:
        "The folder of the preview route, inside the project. Default: theme-preview/ in the app's routes folder (app/ or src/app/); later commands find it there, or take the same --path",
    },
  ],
  examples: [
    {
      label: 'The default pages',
      cli: 'astryx experimental theme preview add',
    },
    {
      label: 'The best page for an idea',
      cli: 'astryx experimental theme preview add "a sales dashboard" --top 2',
    },
    {
      label: 'One template',
      cli: 'astryx experimental theme preview add --template dashboard',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme preview add writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project, or make a new app with `experimental theme preview app <dir>`. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the pages are added',
    },
    {
      code: 1,
      when: 'outside a project, no routes folder and no --path, a --path that is no place for the preview, a file there that the preview did not write or that was changed by hand, a path outside the project, a damaged theme-preview.json, an unknown theme or template, an empty --template, no template page whose packages the app has, a bad --top, a failed write, or another preview command that did not finish within 30 seconds (ERR_THEME_BUSY)',
    },
  ],
  related: [
    'experimental theme preview',
    'experimental theme preview app',
    'experimental theme editor show',
  ],
};
