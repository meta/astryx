// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'iconNewDefinition',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'iconNewDefinition()',
  summary: "Add one of an icon set's own icon definitions.",
  description:
    "Run inside an icon-set package. Writes `<set>/definitions/<name>.doc.mjs`, a strongly typed IconDefinitionDoc with the description and words, and, with `icon`, the set's `map` entry for it. A name Astryx already has is refused: map to Astryx's definition instead. The file is never overwritten, and a write that fails is undone. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'iconNewDefinition(name: string, options?: IconNewDefinitionOptions): Promise<IconNewDefinitionResponse>',
  keywords: ['integration', 'add', 'icon definition', 'icon set', 'author'],
  params: [
    {
      name: 'name',
      type: 'string',
      description: 'camelCase definition name.',
      required: true,
    },
    {
      name: 'options.description',
      type: 'string',
      description: 'One sentence on what an icon with this definition is for.',
      required: true,
    },
    {
      name: 'options.words',
      type: 'string[] | string',
      description: 'Words people search for; a string is split on commas.',
      required: true,
    },
    {
      name: 'options.icon',
      type: 'string',
      description: 'An icon id in the set to map the definition to.',
    },
    {
      name: 'options.set',
      type: 'string',
      description: 'The set, when the package ships several.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'A directory inside the icon-set package.',
    },
    {
      name: 'options.dryRun',
      type: 'boolean',
      description: 'Return the receipt without writing.',
      default: 'false',
    },
  ],
  returns: [
    {
      type: 'icon.newDefinition',
      description:
        'What it wrote: the manifest root, the files, and what to do next.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the name is not camelCase, or Astryx already has it',
    },
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'the description or words are missing',
    },
    {code: 'ERR_FILE_EXISTS', when: 'the definition file already exists'},
    {
      code: 'ERR_NOT_FOUND',
      when: 'the package ships no icon set, `set` names no set in it or one that is withdrawn (with why), or the set has no such icon',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'the folder is outside any project and has no package.json at or above it',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'the declared `experimental.iconSets` root escapes the package',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'the definition file or data file cannot be written; every write before it is undone',
    },
  ],
  examples: [
    {
      label: 'Add and map a definition',
      code: "await iconNewDefinition('random', {description: 'Pick something at random.', words: ['dice', 'shuffle', 'chance'], icon: 'dice-5'});",
    },
  ],
  command: 'experimental icon new-definition',
  related: ['iconNewSet', 'iconMap', 'iconAdd'],
};
