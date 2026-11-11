// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme show`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme show',
  displayName: 'astryx experimental theme show',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Every setting, key values, problems the theme caused, and the theme-building page with every component',
  description:
    'Lists every setting with where it applies and its source (dial, token or property), the resolved value of key tokens in each mode, contrast problems this theme caused versus its base, and font notes. Writes two self-contained HTML files: preview.html (the sample app page) and sheet.html (the theme-building page: every component grouped, each variant side by side, overlays open, and real template pages, with an auto/light/dark switch; the same page `preview` makes). --group limits the sheet to one group. Experimental: it may change or be removed in a patch release.',
  fn: 'themeEditShow',
  args: [
    {
      name: 'theme',
      param: 'theme',
      required: true,
    },
  ],
  options: [
    {
      flag: '--group <name>',
      param: 'options.group',
      description:
        'Only one group on the sheet: actions, inputs, selection, navigation, feedback, data, containers, overlays, or pages',
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
      label: 'Everything',
      cli: 'astryx experimental theme show brand',
    },
    {
      label: 'With pictures',
      cli: 'astryx experimental theme show brand --png',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme show writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the settings are listed and both pages are written',
    },
    {
      code: 1,
      when: 'the theme does not exist, an unknown --group, or a page that does not render',
    },
  ],
  related: ['experimental theme', 'experimental theme compile'],
};
