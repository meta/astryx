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
    "Writes the theme preview into the app: one route, a normal page of the app that keeps its layout, global CSS and providers, in an app shell with a side nav item per preview page and a top bar with the theme name and, when it wears a theme made by `editor`, a light, dark and system switch. A description (\"a sales dashboard\") asks the same page ranking `build` uses for the template pages that fit it best (--top of them, default 1), and adds each as a page, saying in `matched` what it picked and why. App frames (the Shell templates) are left out, since the preview is an app shell already; when the ranking says no page really is this one, it refuses, writes nothing, and names the closest pages to add with --template. A page the app cannot show (a missing package, or StyleX without a compiler) is skipped and the next match is taken, and the result says so; --template names one page template instead; with neither, it adds the default pages: Overview (the theme at a glance, built to show what themes most often break: long and short text, every text level on every surface, every button variant and size with disabled and loading, inputs in their states, selected navigation, status colors, a table, open layers), Components (every component grouped, each with the command that changes it most) and, when the theme sets a color, Colors (each color's shades in light and dark, with the shade number, the hex and the tokens that use each; it reads the theme's generated colors, so it changes with every `editor set`). The route goes in theme-preview/ in the app's routes folder (app/ or src/app/), or in --path; the first add records the pages and the files it wrote in theme-preview.json beside the route, so later calls find it. With no routes folder and no --path, it refuses and names both ways on: --path, or `experimental theme preview app <dir>`, which makes a new starter app with the preview in it. The route fills the whole window with the theme, shell and edges included. Every check (the theme, the template, the ranking and every file it writes) runs before the first write, so a refusal changes nothing. A template page that imports a package the app lacks, or that uses StyleX in an app with no StyleX compiler, is not added: the result names it and the command that installs what it needs. A file the preview did not write is never replaced. The pages wear --theme (default: the only theme under themes/; with none or several, the app's own theme). Experimental: it may change or be removed in a patch release.",
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
      when: 'outside a project, no routes folder and no --path, a file there that the preview did not write, a path outside the project, an unknown theme or template, no template page whose packages the app has, or a bad --top',
    },
  ],
  related: [
    'experimental theme preview',
    'experimental theme preview app',
    'experimental theme editor show',
  ],
};
