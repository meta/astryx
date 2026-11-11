// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditPreview()` / `astryx experimental theme preview`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditPreview',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditPreview()',
  summary:
    'The theme-building page: every component grouped, overlays open, real template pages.',
  description:
    "Makes a page for building the theme: every component grouped (actions, inputs, selection, navigation, feedback, data, containers, overlays shown open), each variant side by side, plus the sample app page and real template pages (dashboard, form, settings; a template whose packages the app lacks is left out and named with its install line). Without --write, it renders the page with the theme to one self-contained HTML file in themes/<theme>/ (sheet.html, or sheet-<group>.html), with an auto/light/dark switch that needs no script. With --write <dir>, it writes theme-preview.tsx into the app instead (a real page using the app's own Astryx, with a light/dark switch) and the template pages beside it, for a route the app serves. --group limits it to one group. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api/experimental',
  signature:
    'themeEditPreview(theme: string, options?: object): Promise<object>',
  keywords: [
    'theme',
    'experimental theme',
    'preview',
    'design tokens',
    'type-checked',
  ],
  params: [
    {
      name: 'theme',
      type: 'string',
      description: 'The theme name.',
      required: true,
    },
    {
      name: 'options.write',
      type: 'string',
      description: 'Write the page into the app, in this folder.',
    },
    {
      name: 'options.group',
      type: 'string',
      description: 'Only one group.',
    },
    {
      name: 'options.png',
      type: 'boolean',
      description: 'Also take PNG pictures of the HTML page.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The app folder.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.preview',
      description:
        'How the page was made (html or page), the files written, the component count, template pages left out, and any pictures.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'an unknown group, or --png with --write',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: '--write is outside the current folder',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: 'the theme does not exist; the suggestion is the `new` command',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: '@astryxdesign/core is not installed in the folder',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'the theme does not build (the change is undone)',
    },
    {
      code: 'ERR_RENDER_FAILED',
      when: "the components or the preview do not render with the project's React",
    },
  ],
  examples: [
    {
      label: 'One HTML file',
      code: 'await themeEditPreview(...)',
    },
  ],
  command: 'experimental theme preview',
  related: ['themeBuild'],
};
