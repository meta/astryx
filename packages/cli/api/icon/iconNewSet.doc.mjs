// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'iconNewSet',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'iconNewSet()',
  summary: 'Add an icon set to an integration package.',
  description:
    "Creates an integration manifest when the package has none, writes the set directory with its strongly typed same-stem IconSetDoc and a starter data file (schemaVersion 1, module set to the package name, no icons and an empty map yet), and the set's generated module with its declaration file and an empty themeIcons theme map; with from, it wraps a library's icons into them, records the installed library and version as the data file's source, copies the library's license notices into the set, uses the library's license, maps each Astryx definition whose name is an icon id, and returns up to three likely icons for each other definition as suggestions (by its name, its words, and the other names the library gives an icon; never a part of a word, a negated form, or the opposite direction), never written. It declares the manifest's `experimental.iconSets` root on first use, and includes the manifest and root in package.json files when the package already uses an allowlist. It never writes the package's entry, exports, main, types, files list, peers, or scripts: its notes name each change the package needs as text to copy. Every path is confined to the package and existing files are never overwritten. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'iconNewSet(name: string, options?: IconNewSetOptions): Promise<IconNewSetResponse>',
  keywords: ['integration', 'add', 'icon', 'icon-set', 'author', 'scaffold'],
  params: [
    {
      name: 'name',
      type: 'string',
      description: 'Lowercase kebab-case icon set name and directory name.',
      required: true,
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Directory inside the integration package.',
    },
    {
      name: 'options.dryRun',
      type: 'boolean',
      description:
        'Validate and return the same receipt without writing; data.written is false and data.dryRun is true.',
      default: 'false',
    },
    {
      name: 'options.from',
      type: 'string',
      description:
        "A module whose every icon the set wraps: a package, a subpath, or a ./ path in the package. Components always; data exports too once the set declares an adapter. Run again to refresh the set's icons.",
    },
    {
      name: 'options.exclude',
      type: 'string[] | string',
      description:
        'With from: export names that are not icons; a string is split on commas. SCREAMING_CASE names and number or boolean exports are always left out.',
    },
    {
      name: 'options.variants',
      type: 'string[] | string',
      description:
        "The variants the set supplies, lower-kebab names such as outline and solid; a string is split on commas. Written to the data file's variants.",
    },
    {
      name: 'options.defaultVariant',
      type: 'string',
      description:
        "With variants: the variant each icon's own export draws, written to the data file's default; the first variant when absent.",
    },
    {
      name: 'options.displayName',
      type: 'string',
      description:
        "The descriptor's display name; the set name in title case when absent.",
    },
    {
      name: 'options.description',
      type: 'string',
      description:
        "The descriptor's one-line description; '<Display name> icons.' when absent.",
    },
  ],
  returns: [
    {
      type: 'icon.newSet',
      description:
        'What it wrote: the manifest root, the files, and what to do next.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the name is not lowercase kebab-case, package.json has no name, or a variant name or the default variant is invalid',
    },
    {
      code: 'ERR_INVALID_OPTION',
      when: '`exclude` is given without `from`, or `defaultVariant` without `variants`',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'the set descriptor or data file already exists',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'a declared `experimental.iconSets` root escapes the package',
    },
    {
      code: 'ERR_INTEGRATION_ROOT_CONFLICT',
      when: 'the manifest root changed to another path while the command was writing',
    },
    {
      code: 'ERR_WRITE_FAILED',
      when: 'a staged write fails and prior writes are rolled back',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'the folder is outside any project and has no package.json at or above it',
    },
    {
      code: 'ERR_NOT_FOUND',
      when: '`from` does not resolve from the package, or exports no icon component',
    },
    {
      code: 'ERR_FILE_NOT_FOUND',
      when: 'a relative `from` resolves to no module file in the package',
    },
  ],
  examples: [
    {
      label: 'Add an icon set',
      code: "await iconNewSet('outline');",
    },
    {
      label: 'Preview writes',
      code: "await iconNewSet('outline', {dryRun: true});",
    },
  ],
  command: 'experimental icon new-set',
  related: ['icon', 'validateIntegration'],
};
