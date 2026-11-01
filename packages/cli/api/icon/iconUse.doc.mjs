// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `iconUse()` / `astryx experimental icon use` (AST-084 FR8). */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'iconUse',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'iconUse()',
  summary: "Choose the project's icon set.",
  description:
    "Writes `experimental.iconSet` in the project's astryx.config (creating astryx.config.mjs when there is none), so templates and blocks the project copies use that set's icons. The set must be installed; a name two installed packages both ship is refused with each `<package>/<set>` form. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'iconUse(set: string, options?: {cwd?: string}): Promise<IconUseResponse>',
  keywords: ['icon', 'icon set', 'use', 'experimental.iconSet', 'config'],
  params: [
    {
      name: 'set',
      type: 'string',
      description: 'An installed set, by name or `<package>/<set>`.',
      required: true,
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The project directory.',
    },
  ],
  returns: [
    {
      type: 'icon.use',
      description:
        "The value written, the set it names, the config file, whether it was created, the value it replaced, and a `warning` when the project's @astryxdesign/cli range admits a release before 0.7.4, which refuses the key.",
    },
  ],
  throws: [
    {
      code: 'ERR_NOT_FOUND',
      when: 'no installed set has the name, or the set it names is withdrawn (the message says which, and why)',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'two installed packages ship a set with the name',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'the config cannot be updated safely: its default export is not a static object literal, or it or its `experimental` object spreads another object, whose keys the written value could replace',
    },
    {
      code: 'ERR_CODEMOD_PROTECTED',
      when: 'the config is reached through a symbolic link, marked generated or vendored, or ignored; the error names the declaration that protects it',
    },
    {
      code: 'ERR_CODEMOD_PROTECTION_SOURCE',
      when: 'a protection declaration in the project cannot be read',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'the folder is outside any project and has no package.json at or above it',
    },
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'the set name is missing',
    },
  ],
  examples: [{label: 'Use a set', code: "await iconUse('outline');"}],
  command: 'experimental icon use',
  related: ['icon', 'iconMap', 'iconAdd'],
};
