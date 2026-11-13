// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme preview app`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme preview app',
  displayName: 'astryx experimental theme preview app',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Make a new starter app with the theme preview inside, ready to install and run',
  description:
    "Writes a new starter app into <dir> (Next.js app router, Core and the neutral theme, with the Astryx packages pinned to this CLI's release), with the theme preview route and its default pages (the sample app page and every component grouped) in src/app/theme-preview/. With --theme, the theme folder is copied into the app's themes/ and the pages wear it; a base theme or font package it needs is added to package.json. No install runs: it prints the install and dev commands and the page to open. <dir> must be new or empty, inside the current folder; a folder that is not empty is refused, with a free folder name to use instead. Every check runs before the first write, so a refusal changes nothing. Later pages go in with `experimental theme preview add`, run in the new app. Every open font the theme names is added to package.json, at the version this project has or a pinned range, and the route imports it; a theme with generated colors gets the Colors page too, and a one-mode theme starts the route in its mode. The app is written into a temp folder beside the folder and moved into place, so a failure leaves nothing behind. A folder holding only .git, .DS_Store or Thumbs.db counts as empty. The folder is refused when it is a file, a dangling link, inside this app's routes folder, themes/, node_modules/ or Next's build folder (.next/, out/ or the distDir next.config names), or written with Windows separators, white space at either end or a name too long. A theme whose build is missing or older than its settings is built first, with a note. The app's home page links to the preview, and its .gitignore leaves out node_modules, next-env.d.ts and *.tsbuildinfo. Inside a project with a tsconfig.json, a note says to exclude the new folder. It takes one folder; more arguments are refused. With a theme, it holds that theme's lock while it builds and copies it, so an `editor set` on the same theme waits for it. A folder given from a subfolder of the project is taken from where it was given. An app is refused in public/ (served as files at the site root) and under a name Windows does not allow; a base theme passed to --theme is named as a package theme, installed or not, with the command that adds it. Experimental: it may change or be removed in a patch release.",
  fn: 'themeEditPreviewApp',
  args: [
    {
      name: 'dir',
      param: 'dir',
      required: true,
    },
  ],
  options: [
    {
      flag: '--theme <name>',
      param: 'options.theme',
      description:
        "A theme made by experimental theme editor here: copied into the app, and the pages wear it (default: the app's own neutral theme)",
    },
  ],
  examples: [
    {
      label: 'A new app',
      cli: 'astryx experimental theme preview app theme-app',
    },
    {
      label: 'A new app wearing a theme',
      cli: 'astryx experimental theme preview app theme-app --theme brand',
    },
  ],
  outsideProject: 'own',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme preview app works the same: it makes the new app, with its pages from this CLI's own Core. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the app is written',
    },
    {
      code: 1,
      when: 'no <dir>, a folder that is not empty or is no place for an app, a folder outside the current one, an unknown theme, more than one folder, a failed write, or another command changing the theme that did not finish within 30 seconds (ERR_THEME_BUSY)',
    },
  ],
  related: ['experimental theme preview', 'experimental theme preview add'],
};
