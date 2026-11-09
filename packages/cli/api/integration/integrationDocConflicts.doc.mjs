// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for integration doc-relationship diagnostics. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'integrationDocConflicts',
  namespace: 'cli/api',
  displayName: 'integrationDocConflicts()',
  summary:
    "Check an integration's docs: the docs tree they add, every link, and overlaps with Core topics.",
  description:
    'Loads one local or installed integration and classifies Core doc overlaps as ' +
    'intentional replacements, intentional extensions, or accidental same-name ' +
    'conflicts that need an explicit relationship or a rename. `copiedPassages` lists each ' +
    'pair of topics that repeat 10 or more words of prose word for word: two of the ' +
    "package's topics, or one of them and a Core topic other than the one it replaces. " +
    'Code and examples are not compared. `fluff` lists each padding phrase, with its file ' +
    'line, and each topic of 80 or more prose words in which fewer than half carry content. ' +
    '`strayPointers` lists each code span that is exactly `{@command docs <name>}` for a doc that ' +
    "exists, in a topic's prose, description or summary or a component doc's text fields, " +
    'with the `{@link}` that replaces it. ' +
    'Each entry of these lists is also a warning (`copied_passage`, `doc_fluff`, `stray_doc_pointer`), so ' +
    '`integration check --strict` fails on it; the check itself still fails only on errors.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'integrationDocConflicts(pkg?: string, options?: IntegrationAuthoringOptions): Promise<IntegrationDocConflictResponse>',
  keywords: ['integration', 'docs', 'replace', 'extend', 'authoring', 'doctor'],
  params: [
    {
      name: 'pkg',
      type: 'string',
      description: 'Installed package; omit for the local package.',
    },
    {name: 'options.cwd', type: 'string', description: 'Resolution directory.'},
  ],
  returns: [
    {
      type: 'integration.doc-conflicts',
      description:
        '`validated` (false when no integration manifest was found, so nothing was inspected), integration identity, structural issues, classified Core doc relationships, `copiedPassages`, `fluff`, and `strayPointers`.',
    },
  ],
  examples: [
    {
      label: 'Check the local integration',
      code: 'await integrationDocConflicts();',
    },
  ],
  command: 'doctor integration docs',
  related: ['validateIntegration', 'docs'],
};
