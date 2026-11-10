// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme new`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme new',
  displayName: 'astryx experimental theme new',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'Start a theme in themes/<theme>/, optionally on a built-in theme',
  description:
    'Makes themes/<theme>/ with <theme>.settings.json (the settings this command owns), the generated <theme>.settings.ts, <theme>.theme.ts (which extends it and is yours), and the built <theme>.css and <theme>.js (the same build as `astryx theme build`), then writes preview.html, the sample app page with the theme. --like builds on a built-in theme (neutral, stone, matcha, y2k, gothic, chocolate, butter; its package must be installed); without it the theme starts from Astryx defaults. Change the base later with `astryx experimental theme set <theme> base <theme|none>`. Afterwards, <theme>.theme.ts is yours: it extends the generated <theme>.settings.ts, and every later change rewrites only the settings files, so your own edits in <theme>.theme.ts survive. A theme name is lowercase letters, digits and dashes. Experimental: it may change or be removed in a patch release.',
  fn: 'themeEditNew',
  args: [
    {
      name: 'theme',
      param: 'theme',
      required: true,
    },
  ],
  options: [
    {
      flag: '--like <theme>',
      param: 'options.like',
      description:
        'A built-in theme to build on: neutral, stone, matcha, y2k, gothic, chocolate, or butter',
    },
    {
      flag: '--png',
      param: 'options.png',
      description:
        'Also take PNG pictures of the previews (light and dark), with a Playwright installed in the project or a Chrome or Chromium found on the machine; without one, the result says how to get it. Nothing else changes',
    },
  ],
  examples: [
    {
      label: 'Start on a built-in theme',
      cli: 'astryx experimental theme new brand --like neutral',
    },
    {
      label: 'Start from Astryx defaults',
      cli: 'astryx experimental theme new brand',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme new writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the theme is made and built, and its preview is written',
    },
    {
      code: 1,
      when: 'a name that is not lowercase letters, digits and dashes, a theme that already exists, a --like that is not a built-in theme or is not installed, no Core installed in the folder, or a build failure (nothing is left behind)',
    },
  ],
  related: ['experimental theme', 'experimental theme compile'],
  replaces: ['theme template', 'theme eject'],
};
