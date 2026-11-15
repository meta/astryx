// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `rankSearchIndex()`. Colocated with the API function it
 * documents; the shape source of truth stays in `search.type.mjs`.
 * @position packages/cli/api/search — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'rankSearchIndex',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'rankSearchIndex()',
  summary:
    "Ranks stored search indexes with search's own tree: an index made in one folder answers as search() does there.",
  description:
    "Ranks the candidates of every index together, with the same tree, weights, and order as {@link function:search}. An index made with `exportSearchIndex()` in one folder ranks exactly as `search(query)` does in that folder: the same results, order, and scores. Indexes made in separate folders are ranked together as one list; a doc that one package replaces or extends in another is not merged across them, so a project's own `search` can differ where that happens. A theme result's command is the in-project `theme add`. When every index was made where Core could not be had, an open rank (no `type`) carries `meta.partial`, as `search` does; a rank of `type` `component`, `hook`, or `template` throws the error `search` throws there. Every index must come from this CLI's version, because the candidates' shape is the ranker's input. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'rankSearchIndex(query: string, indexes: SearchIndex | SearchIndex[], options?: {type?: SearchDomain, limit?: number}): Promise<SearchResponse>',
  keywords: ['search index', 'stored search index'],
  params: [
    {
      name: 'query',
      type: 'string',
      description: 'Free-text search term.',
      required: true,
    },
    {
      name: 'indexes',
      type: 'SearchIndex | SearchIndex[]',
      description:
        'Indexes made by `exportSearchIndex()` with this CLI version.',
      required: true,
    },
    {
      name: 'options.type',
      type: "'component' | 'hook' | 'doc' | 'template' | 'theme'",
      description: 'Restrict results to a single domain.',
    },
    {
      name: 'options.limit',
      type: 'number',
      description: 'Maximum number of results.',
      default: '20',
    },
  ],
  returns: [
    {
      type: 'search',
      description:
        'The same response as `search()`: the query, `matchCount`, and the ranked results bounded by `limit`.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the query is empty, `type` is unknown, `limit` is not a positive integer, an index is not `{version, candidates}`, or an index was made by another CLI version',
    },
    {
      code: 'ERR_CORE_NOT_FOUND',
      when: 'every index was made where @astryxdesign/core could not be found, and `type` names a domain that reads it: `component`, `hook`, or `template`',
    },
    {
      code: 'ERR_VERSIONS_UNAVAILABLE',
      when: 'every index was made where the Core of the release that answers could not be installed into the per-user cache, and `type` names a domain that reads it: `component`, `hook`, or `template`; a rank with no `type` answers with `meta.partial` instead',
    },
  ],
  examples: [
    {
      label: 'Rank stored indexes',
      code: 'const r = await rankSearchIndex(text, [coreIndex, ...packageIndexes]);',
    },
  ],
  related: ['search', 'exportSearchIndex'],
};
