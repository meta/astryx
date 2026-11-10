// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme preview`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme preview',
  displayName: 'astryx experimental theme preview',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'The theme-building page: every component grouped, overlays open, real template pages',
  description:
    "Makes a page for building the theme: every component grouped (actions, inputs, selection, navigation, feedback, data, containers, overlays shown open), each variant side by side, plus the sample app page and real template pages (dashboard, form, settings; a template whose packages the app lacks is left out and named with its install line). Without --write, it renders the page with the theme to one self-contained HTML file in themes/<theme>/ (sheet.html, or sheet-<group>.html), with an auto/light/dark switch that needs no script. With --write <dir>, it writes theme-preview.tsx into the app instead (a real page using the app's own Astryx, with a light/dark switch) and the template pages beside it, for a route the app serves. --group limits it to one group. Experimental: it may change or be removed in a patch release.",
  fn: 'themeEditPreview',
  args: [
    {
      name: 'theme',
      param: 'theme',
      required: true,
    },
  ],
  options: [
    {
      flag: '--write <dir>',
      param: 'options.write',
      description:
        'Write the page into the app, in this folder (inside the current folder): theme-preview.tsx and the template pages it shows',
    },
    {
      flag: '--group <name>',
      param: 'options.group',
      description:
        'Only one group: actions, inputs, selection, navigation, feedback, data, containers, overlays, or pages',
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
      label: 'One HTML file',
      cli: 'astryx experimental theme preview brand',
    },
    {
      label: 'Into the app',
      cli: 'astryx experimental theme preview brand --write src/app/theme-preview',
    },
    {
      label: 'Just the overlays',
      cli: 'astryx experimental theme preview brand --group overlays',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme preview writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the page is rendered or written',
    },
    {
      code: 1,
      when: 'the theme does not exist, an unknown --group, --write outside the current folder, --png with --write, or a page that does not render',
    },
  ],
  related: ['experimental theme', 'experimental theme compile'],
};
