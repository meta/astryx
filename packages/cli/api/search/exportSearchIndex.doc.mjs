// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `exportSearchIndex()`. Colocated with the API function it
 * documents; the shape source of truth stays in `search.type.mjs`.
 * @position packages/cli/api/search — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'exportSearchIndex',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'exportSearchIndex()',
  summary:
    'The candidates search ranks in a folder, as plain JSON to store and rank later with rankSearchIndex().',
  description:
    "Gathers what `search()` would rank in `cwd` and returns it as `{version, candidates}`. Gathering reads each installed package's docs and loads its integration manifest, which runs that package's code, so a catalog that lists packages it must not load makes the index where loading is safe (a folder with those packages installed), stores it, and ranks it with {@link function:rankSearchIndex}. With `package`, the index keeps only that package's candidates, for a catalog that stores one index per package. A component description's inline doc tokens are resolved where the index is made, as `search` prints them; when Core could not be had there, the index says why in `coreSkipped`. Fields that point into the folder are left out, so an index reads the same wherever it was made. The candidates are the ranker's input, not a stable shape: an index is ranked only by the CLI version that made it. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api',
  signature: 'exportSearchIndex(options?: {cwd?: string, package?: string}): Promise<SearchIndex>',
  keywords: ['search index', 'stored search index'],
  params: [
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The folder to gather from, read as `search()` reads it.',
      default: 'process.cwd()',
    },
    {
      name: 'options.package',
      type: 'string',
      description:
        "Keep only the candidates this npm package owns: its components, templates, themes, and doc parts. Without it the index holds everything the folder's search ranks, Core's entries and the CLI's docs included.",
    },
  ],
  returns: [
    {
      type: 'SearchIndex',
      description:
        '`version`, the CLI version that made it, and `candidates`, the gathered entries as plain JSON.',
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
      label: 'Index one installed integration',
      code: "const index = await exportSearchIndex({cwd: '/tmp/harness', package: '@acme/ui'});",
    },
  ],
  related: ['search', 'rankSearchIndex'],
};
