// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditUndo()` / `astryx experimental theme editor undo`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditUndo',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditUndo()',
  summary:
    'Put the theme back as it was before its last change, or remove one setting.',
  description:
    'With only the theme, it steps back one change: the settings file, the theme source and the build go back to how they were before the last change, and the preview is rewritten; the result names what was undone and how many earlier steps are left. When the settings file is damaged (not valid JSON), the step back restores the settings from before the last change without reading it. With `thing`, it removes that one setting instead, wherever it is in the settings, and the `now` field of the result says what applies instead (a dial that still writes it, a whole-theme setting of the same thing, or the value of the base theme); name it the way it was set, with the same `on`, `when`, `state`, `mode` and `only`. Removing a color (accent, neutral, success, warning, danger, info) stops generating it, and the tokens it fed go back to the base theme; with no color left, the generated color files are deleted. Removing vibrancy makes the colors again at the default, 50; removing the last color removes vibrancy too, as it needs a color. Experimental: it may change or be removed in a patch release.',
  importPath: '@astryxdesign/cli/api/experimental',
  signature: 'themeEditUndo(theme: string, options?: object): Promise<object>',
  keywords: [
    'theme',
    'experimental theme',
    'undo',
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
      name: 'options.thing',
      type: 'string',
      description:
        "Remove this one setting (a dial, a token, or a CSS property) instead of stepping back one change; the result's `now` says what applies instead: a whole-theme setting of the same thing, or the base theme's value.",
    },
    {
      name: 'options.value',
      type: 'string',
      description:
        'With `thing` `headings`: which half to remove, `weight` or `tracking` (default `weight`).',
    },
    {
      name: 'options.on',
      type: 'string',
      description: 'With `thing`: the part, group or role it was set on.',
    },
    {
      name: 'options.when',
      type: 'string',
      description:
        'With `thing`: the variant it was set for (`<prop>:<value>`).',
    },
    {
      name: 'options.state',
      type: 'string',
      description: 'With `thing`: the state it was set for.',
    },
    {
      name: 'options.mode',
      type: 'string',
      description:
        'With `thing`: the color mode it was set for, `light` or `dark`.',
    },
    {
      name: 'options.only',
      type: 'boolean',
      description: 'With `thing`: it was set with `only`.',
    },
    {
      name: 'options.png',
      type: 'boolean',
      description: 'Also take PNG pictures of the preview.',
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
      type: 'themeEdit.undo',
      description:
        'What was undone, the settings count now, the undo steps left, and the preview.',
    },
  ],
  throws: [
    {
      code: 'ERR_THEME_NOTHING_TO_UNDO',
      when: 'there is no earlier change',
    },
    {
      code: 'ERR_THEME_NOT_SET',
      when: 'with `thing`: the theme does not set it that way; the error lists the settings it has for that thing',
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
      code: 'ERR_THEME_BUSY',
      when: 'another command is changing the same theme and did not finish within 30 seconds; nothing was changed',
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
      label: 'Step back',
      code: 'await themeEditUndo(...)',
    },
  ],
  command: 'experimental theme editor undo',
  related: ['themeBuild'],
};
