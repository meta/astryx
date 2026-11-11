// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditShow()` / `astryx experimental theme editor show`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditShow',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditShow()',
  summary:
    'Every setting, key values, problems the theme caused, and the theme-building page with every component.',
  description:
    'Lists every setting with where it applies and its source (dial, token or property), the resolved value of key tokens in each mode, the colors (the vibrancy; each color with its seed and the shade each token uses in light and dark, marked when an exact token setting wins; any shade moved so text reads), contrast problems this theme caused versus its base, font notes, and last the generated color files. Writes two self-contained HTML files: preview.html (the sample app page) and sheet.html (the theme-building page: every component grouped, each variant side by side, overlays open, and real template pages, with an auto/light/dark switch). A theme with no build is built first, and an in-app preview (`preview add`) of the theme has its route and Colors page rewritten. --section limits the sheet to one section. Experimental: it may change or be removed in a patch release.',
  importPath: '@astryxdesign/cli/api/experimental',
  signature: 'themeEditShow(theme: string, options?: object): Promise<object>',
  keywords: [
    'theme',
    'experimental theme',
    'show',
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
      name: 'options.section',
      type: 'string',
      description: 'Only one section of the sheet.',
    },
    {
      name: 'options.png',
      type: 'boolean',
      description: 'Also take PNG pictures.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The app folder.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.show',
      description:
        'Every setting and the parts it styles, key resolved values per mode, contrast problems, notes, both pages, template pages left out, and any pictures.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'an unknown section',
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
      label: 'Everything',
      code: 'await themeEditShow(...)',
    },
  ],
  command: 'experimental theme editor show',
  related: ['themeBuild'],
};
