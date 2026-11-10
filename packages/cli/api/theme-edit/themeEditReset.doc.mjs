// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditReset()` / `astryx experimental theme reset`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditReset',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditReset()',
  summary: "Return one setting to the base theme's value, rebuild, preview.",
  description:
    "Returns one setting to the base theme's value: the setting is removed, and the theme is rebuilt and previewed. Name it the way it was set: the same thing and the same --on, --when, --state, --mode and --only (`show` lists every setting that way). For the headings dial, name which half to reset: weight or tracking (default weight). A setting the theme does not have is refused and the error lists the settings it has for that thing. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api/experimental',
  signature:
    'themeEditReset(theme: string, thing: string, options?: object): Promise<object>',
  keywords: [
    'theme',
    'experimental theme',
    'reset',
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
      name: 'thing',
      type: 'string',
      description: 'The thing the setting changes.',
      required: true,
    },
    {
      name: 'options.value',
      type: 'string',
      description: 'For `headings`: `weight` or `tracking`.',
    },
    {
      name: 'options.on',
      type: 'string',
      description: 'The part, family or role it was set on.',
    },
    {
      name: 'options.when',
      type: 'string',
      description: 'The variant it was set for.',
    },
    {
      name: 'options.state',
      type: 'string',
      description: 'The state it was set for.',
    },
    {
      name: 'options.mode',
      type: 'string',
      description: 'The mode it was set for.',
    },
    {
      name: 'options.only',
      type: 'boolean',
      description: 'Whether it was set with `--only`.',
    },
    {
      name: 'options.png',
      type: 'boolean',
      description: 'Also take PNG pictures of the preview.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The app folder.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.reset',
      description:
        'The setting removed, resolved token changes, part styles changed, notes, contrast problems, and the preview.',
    },
  ],
  throws: [
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'no thing or value, or --when/--state without --on',
    },
    {
      code: 'ERR_THEME_UNKNOWN_PART',
      when: '--on is not a part or a family',
    },
    {
      code: 'ERR_THEME_UNKNOWN_VARIANT',
      when: '--when names a prop or value the part does not have',
    },
    {
      code: 'ERR_THEME_UNKNOWN_STATE',
      when: '--state is not a state of the part',
    },
    {
      code: 'ERR_THEME_UNKNOWN_TOKEN',
      when: 'the token does not exist',
    },
    {
      code: 'ERR_THEME_PRIVATE_TOKEN',
      when: 'the variable is private to a component',
    },
    {
      code: 'ERR_THEME_UNKNOWN_THING',
      when: 'the thing is not a dial, a token or a CSS property',
    },
    {
      code: 'ERR_THEME_BAD_VALUE',
      when: 'the value does not fit the thing',
    },
    {
      code: 'ERR_THEME_NO_MODE',
      when: '--mode on something that cannot differ by mode',
    },
    {
      code: 'ERR_THEME_NO_EFFECT',
      when: 'the change could not take effect; the suggestions name what works',
    },
    {
      code: 'ERR_THEME_NOT_SET',
      when: '`reset` names a setting the theme does not have',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: '--only on a part that is not a member of an always-alike family',
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
      label: 'Reset a whole-theme dial',
      code: 'await themeEditReset(...)',
    },
  ],
  command: 'experimental theme reset',
  related: ['themeBuild'],
};
