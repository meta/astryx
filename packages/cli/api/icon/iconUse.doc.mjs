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
  summary: "Choose the project's main icon set and backups.",
  description:
    "Writes `experimental.iconSet` in the project's astryx.config (creating astryx.config.mjs when there is none), so templates and blocks the project copies use that set's icons. With no backups it writes the set name as a string. With backups it writes a list, the main set first and then each backup in order: a copied template takes each icon from the first set in the list that has its meaning, and draws a placeholder the copied file declares when none has it. Every set must be installed; a name two installed packages both ship is refused with each `<package>/<set>` form. The receipt lists installed sets the list leaves out (`unlisted`), which Doctor fails, with the command that adds them. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'iconUse(set: string, options?: {cwd?: string, backups?: string[]}): Promise<IconUseResponse>',
  keywords: [
    'icon',
    'icon set',
    'use',
    'backup',
    'main set',
    'experimental.iconSet',
    'config',
  ],
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
    {
      name: 'options.backups',
      type: 'string[]',
      description:
        'Backup sets, by name or `<package>/<set>`, in the order a copied template tries them after the main set.',
    },
  ],
  returns: [
    {
      type: 'icon.use',
      description:
        "The main set and the backups written, the sets they name, the config file, whether it was created, the value it replaced, the installed sets the list leaves out (`unlisted`, with a `next` command), and a `warning` when the project's @astryxdesign/cli range admits a release that refuses the value: before 0.7.4 for a string, before 0.7.12 for a list.",
    },
  ],
  throws: [
    {
      code: 'ERR_NOT_FOUND',
      when: 'no installed set has the name, or the set it names is withdrawn (the message says which, and why)',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'two installed packages ship a set with the name, or the list names one set twice',
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
  examples: [
    {label: 'Use a set', code: "await iconUse('outline');"},
    {
      label: 'Use a main set with a backup',
      code: "await iconUse('outline', {backups: ['@acme/brand-icons/brand']});",
    },
  ],
  command: 'experimental icon use',
  related: ['icon', 'iconMap', 'iconAdd'],
};
