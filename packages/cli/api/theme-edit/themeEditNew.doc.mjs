// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditNew()` / `astryx experimental theme editor new`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditNew',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditNew()',
  summary: 'Start a theme in themes/<theme>/, optionally on a built-in theme.',
  description:
    'Makes themes/<theme>/ with <theme>.settings.json (the settings this command owns), the generated <theme>.settings.ts, <theme>.theme.ts (which extends it and is yours), and the built <theme>.css and <theme>.js (the same build as `astryx theme build`), then writes preview.html, the sample app page with the theme. --like builds on a built-in theme (neutral, stone, matcha, y2k, gothic, chocolate, butter; its package must be installed); without it the theme starts from Astryx defaults. `settings` takes any `set` dial by name ({accent: "#7c3aed", font: "inter", corners: "round", vibrancy: "60"}): the same names, values and checks as `set`, all applied in the one build, with one result that lists them. Change the base later with `astryx experimental theme editor set <theme> base <theme|none>`. Afterwards, <theme>.theme.ts is yours: it extends the generated <theme>.settings.ts, and every later change rewrites only the settings files, so your own edits in <theme>.theme.ts survive. A theme name is lowercase letters, digits and dashes. Experimental: it may change or be removed in a patch release.',
  importPath: '@astryxdesign/cli/api/experimental',
  signature: 'themeEditNew(theme: string, options?: object): Promise<object>',
  keywords: [
    'theme',
    'experimental theme',
    'new',
    'design tokens',
    'type-checked',
  ],
  params: [
    {
      name: 'theme',
      type: 'string',
      description: 'The theme name: lowercase letters, digits and dashes.',
      required: true,
    },
    {
      name: 'options.like',
      type: 'string',
      description: 'A built-in theme to build on.',
    },
    {
      name: 'options.png',
      type: 'boolean',
      description: 'Also take PNG pictures of the preview.',
    },
    {
      name: 'options.settings',
      type: 'Record<string, string>',
      description:
        'Dial settings to start with, by dial name, each checked as `set` checks it: every dial but base (use `like`).',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'The folder to start from (default: the current directory): commands act on the Astryx project at or above it, so a subfolder of an app works.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.new',
      description:
        'The theme, its base, the files written, contrast problems, and the preview.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the name is not lowercase letters, digits and dashes, or `settings` names something that is not a dial',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'the theme, or files in its folder, already exist',
    },
    {
      code: 'ERR_THEME_BAD_VALUE',
      when: '`like` is not a built-in theme, or a setting has a value `set` refuses',
    },
    {
      code: 'ERR_THEME_NO_EFFECT',
      when: '`settings` has vibrancy and no color',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: 'the built-in theme is not installed; the suggestion is its install line',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: '@astryxdesign/core is not installed in the folder',
    },
    {
      code: 'ERR_THEME_BUSY',
      when: 'another command is changing the same theme and did not finish within 30 seconds; nothing was changed',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'the theme does not build',
    },
  ],
  examples: [
    {
      label: 'Start on a built-in theme',
      code: 'await themeEditNew(...)',
    },
  ],
  command: 'experimental theme editor new',
  related: ['themeBuild'],
};
