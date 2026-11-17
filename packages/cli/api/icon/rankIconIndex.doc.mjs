// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `rankIconIndex()`. Colocated with the API function it
 * documents; the shape source of truth stays in `icon.type.mjs`.
 * @position packages/cli/api/icon — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'rankIconIndex',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'rankIconIndex()',
  summary:
    "Ranks stored icon indexes with icon()'s own ranking: an index made in one folder answers as icon() does there.",
  description:
    "Ranks the sets of every index together, with the same ranking as {@link function:icon}. An index made with `exportIconIndex()` in one folder answers a word search exactly as `icon(query)` does in that folder: the same matches, order, scores, and `matchCount`. A `<set>/<id>` query, which `icon()` reads as one icon, is refused. Indexes made in separate folders are ranked as one list, in the order they are given: equal scores keep that order, as `icon()` keeps a project's set order. An index holds no project order, so no set leads unless its index comes first; each set draws the look its index carries. `set` keeps one set, by name or `<package>/<set>`, with the errors `icon()` gives. Every index must come from this CLI's version, because the sets' shape is the ranker's input. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'rankIconIndex(query: string, indexes: IconIndex | IconIndex[], options?: {set?: string, limit?: number}): Promise<IconSearchResponse>',
  keywords: ['icon index', 'stored icon index', 'icon search'],
  params: [
    {
      name: 'query',
      type: 'string',
      description: 'Words to search for.',
      required: true,
    },
    {
      name: 'indexes',
      type: 'IconIndex | IconIndex[]',
      description: 'Indexes made by `exportIconIndex()` with this CLI version.',
      required: true,
    },
    {
      name: 'options.set',
      type: 'string',
      description: 'Search one set, by name or `<package>/<set>`.',
    },
    {
      name: 'options.limit',
      type: 'number',
      description:
        'Max matches, a positive integer. `matchCount` counts every match.',
      default: '10',
    },
  ],
  returns: [
    {
      type: 'icon.search',
      description:
        'The same response as `icon(query)`: the query, `matchCount`, and the ranked matches bounded by `limit`.',
    },
  ],
  throws: [
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'the query is empty',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the query is not a string or names one icon (`<set>/<id>`), `limit` is not a positive integer, an index is not `{version, sets}`, or an index was made by another CLI version',
    },
    {
      code: 'ERR_NOT_FOUND',
      when: '`set` names no valid set in the indexes',
    },
  ],
  examples: [
    {
      label: 'Rank one stored index',
      code: "const r = await rankIconIndex('delete', index);",
    },
  ],
  related: ['icon', 'exportIconIndex'],
};
