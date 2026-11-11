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
    "Writes a new starter app into <dir> (Next.js app router, Core and the neutral theme, with the Astryx packages pinned to this CLI's release), with the theme preview route and its default pages (the sample app page and every component grouped) in src/app/theme-preview/. With --theme, the theme folder is copied into the app's themes/ and the pages wear it; a base theme or font package it needs is added to package.json. No install runs: it prints the install and dev commands and the page to open. <dir> must be new or empty, inside the current folder; --overwrite uses a folder that is not empty, but never replaces a protected file there, and keeps its own package.json and .gitignore. Every check runs before the first write, so a refusal changes nothing. Later pages go in with `experimental theme preview add`, run in the new app. Experimental: it may change or be removed in a patch release.",
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
    {
      flag: '--overwrite',
      param: 'options.overwrite',
      description:
        'Write into a folder that is not empty; a protected file is never replaced, and its own package.json and .gitignore are kept',
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
      when: 'no <dir>, a folder that is not empty without --overwrite or a protected file in it, a folder outside the current one, or an unknown theme',
    },
  ],
  related: ['experimental theme preview', 'experimental theme preview add'],
};
