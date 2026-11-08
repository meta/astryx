// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `iconMap()` / `astryx experimental icon map` (AST-084 FR13). */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'iconMap',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'iconMap()',
  summary:
    'Register which icon of the set being authored draws an icon definition.',
  description:
    "Run inside an icon-set package. Sets `map[definition] = icon` in the set's data file, or removes the entry. The definition must be Astryx's or one the set declares, named by its name or kebab id. The icon must be in the set, named by its id, its export name in any case, or another name its library exports it as (`trash-2` or `Trash2`), never by one word of its id; the entry records its id. The file is written in one fixed shape, `map` keys sorted. `integration check` suggests these commands for definitions the set has a fitting icon for. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'iconMap(definition: string | undefined, icon?: string, options?: IconMapOptions): Promise<IconMapResponse | IconMapManyResponse>',
  keywords: ['icon', 'icon set', 'map', 'icon definition', 'register'],
  params: [
    {
      name: 'definition',
      type: 'string | undefined',
      description: 'The icon definition. Omit with `options.pairs`.',
      required: false,
    },
    {
      name: 'icon',
      type: 'string',
      description:
        'An icon in the set, named by its id, its export name in any case (`TrashIcon`, `trashicon`), or another name its library exports it as, as an id or as the library spells it (`trash-2`, `Trash2`); never one word of its id. Omit with `remove`.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'A directory inside the icon-set package.',
    },
    {
      name: 'options.set',
      type: 'string',
      description: 'The set, when the package ships several.',
    },
    {
      name: 'options.remove',
      type: 'boolean',
      description: "Remove the definition's entry.",
      default: 'false',
    },
    {
      name: 'options.pairs',
      type: 'string | string[]',
      description:
        'Many entries at once: `<definition>=<icon>` pairs separated by commas or spaces, with no definition or icon argument; each icon is named as the icon argument is. Every pair is checked before any is written.',
    },
  ],
  returns: [
    {
      type: 'icon.mapMany',
      description:
        'With pairs: the set, the data file, each entry with the icon it replaced, and whether the file changed.',
    },
    {
      type: 'icon.map',
      description:
        'The set, the data file, the definition, the icon now mapped, the icon it replaced, and whether the file changed.',
    },
  ],
  throws: [
    {
      code: 'ERR_NOT_FOUND',
      when: 'the definition is unknown, the set has no such icon, or `set` names no set in the package or one that is withdrawn (with why)',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the package ships several sets and none is named',
    },
    {
      code: 'ERR_INVALID_OPTION',
      when: '`pairs` is given with a definition, an icon, or `remove`, or `remove` with an icon',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'the folder is outside any project and has no package.json at or above it',
    },
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'the definition is missing, or the icon without `remove`',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'the declared `experimental.iconSets` root escapes the package',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'the data file or generated module cannot be written; every write before it is undone',
    },
  ],
  examples: [
    {label: 'Map a definition', code: "await iconMap('delete', 'trash');"},
    {
      label: 'Remove an entry',
      code: "await iconMap('delete', undefined, {remove: true});",
    },
  ],
  command: 'experimental icon map',
  related: ['iconAdd', 'iconNewDefinition', 'validateIntegration'],
};
