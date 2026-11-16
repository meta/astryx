// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `exportIconIndex()`. Colocated with the API function it
 * documents; the shape source of truth stays in `icon.type.mjs`.
 * @position packages/cli/api/icon — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'exportIconIndex',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'exportIconIndex()',
  summary:
    'The icon sets icon() searches in a folder, as plain JSON to store and rank later with rankIconIndex().',
  description:
    "Reads the icon sets `icon()` would search in `cwd` and returns them as `{version, sets, withdrawn}`. Reading them loads each installed package's integration manifest, which runs that package's code, so a catalog that lists packages it must not load makes the index where loading is safe (a folder with those packages installed), stores it, and ranks it with {@link function:rankIconIndex}. With `package`, the index keeps only the sets that package ships, for a catalog that stores one index per package. Paths into the folder are left out, so an index reads the same wherever it was made. The sets are the ranker's input, not a stable shape: an index is ranked only by the CLI version that made it. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'exportIconIndex(options?: {cwd?: string, package?: string}): Promise<IconIndex>',
  keywords: ['icon index', 'stored icon index', 'icon search'],
  params: [
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The folder to read, as `icon()` reads it.',
      default: 'process.cwd()',
    },
    {
      name: 'options.package',
      type: 'string',
      description:
        'Keep only the sets this npm package ships. Without it the index holds every installed set.',
    },
  ],
  returns: [
    {
      type: 'IconIndex',
      description:
        '`version`, the CLI version that made it; `sets`, the valid sets in tie order as plain JSON; and `withdrawn`, the sets read but withdrawn, and why.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: '`package` is given and is not a non-empty string',
    },
  ],
  examples: [
    {
      label: 'Index one installed icon-set package',
      code: "const index = await exportIconIndex({cwd: '/tmp/harness', package: '@acme/icons'});",
    },
  ],
  related: ['icon', 'rankIconIndex'],
};
