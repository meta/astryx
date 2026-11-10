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
    "Writes the theme preview into the app: one route, a normal page of the app that keeps its layout, global CSS and providers, in an app shell with a side nav item per preview page and a top bar with the theme name and a light, dark and system switch. A description (\"a sales dashboard\") asks the same page ranking `build` uses for the template pages that fit it best (--top of them, default 1), and adds each as a page; --template names one page template instead; with neither, it adds the default pages: the sample app page and every component grouped. The route goes in theme-preview/ in the app's routes folder (app/ or src/app/), or in --path; the first add records the pages and the files it wrote in theme-preview.json beside the route, so later calls find it. With no routes folder and no --path, it refuses and names both ways on. --app makes a new starter app in that folder instead (Next.js app router, Core and the neutral theme, with the Astryx packages pinned to this CLI's release) with the route in it; no install runs. A file the preview did not write is never replaced. The pages wear --theme (default: the only theme under themes/; with none or several, the app's own theme). Experimental: it may change or be removed in a patch release.",
  fn: 'themeEditPreviewAdd',
  args: [
    {
      name: 'description',
      param: 'description',
      required: false,
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
    {
      flag: '--app <dir>',
      param: 'options.app',
      description:
        "Make a new starter app in this folder (Next.js app router, Core and the neutral theme, Astryx pinned to this CLI's release) with the preview in it. Nothing is installed: the result prints the install and dev commands",
    },
    {
      flag: '--overwrite',
      param: 'options.overwrite',
      description: 'With --app: write into a folder that is not empty',
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
    {
      label: 'A new app',
      cli: 'astryx experimental theme preview add --app theme-app',
    },
  ],
  outsideProject: 'own',
  notes: [
    {
      type: 'prose',
      text: "Outside a project, with no package.json in the folder or above it, it needs --app, which makes a new app; without it, it writes nothing and stops with `ERR_PROJECT_REQUIRED`. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the pages are added',
    },
    {
      code: 1,
      when: 'no routes folder and neither --path nor --app, a file there that the preview did not write, a non-empty --app folder without --overwrite, a path outside the current folder, an unknown theme or template, or a bad --top',
    },
  ],
  related: ['experimental theme preview', 'experimental theme editor show'],
};
