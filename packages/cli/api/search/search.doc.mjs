// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `search()` / `astryx search`. Colocated with the API
 * function it documents; the shape source of truth stays in `search.type.mjs`.
 * @position packages/cli/api/search — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'search',
  namespace: 'cli/api',
  displayName: 'search()',
  summary:
    'Unified ranked search across components, hooks, docs, templates, and themes.',
  description:
    'The single "I\'m looking for X" entry point across every content domain. ' +
    'Matching and scores are keyword + fuzzy (not embeddings). Between score bands ' +
    'results keep the lexical order, whose domain priority can put a weaker ' +
    'component, hook, template, or theme above a stronger doc, and a query that is an entry\'s exact name answers ' +
    'with that entry first. Inside a band, fixed weights order the matches, so a ' +
    'description match can lead a keyword match in the same band (55–99 holds both). ' +
    'A component\'s usage guidance (its best practices) is indexed one tier below ' +
    'its description, so the words a reader types still find it.' +
    " In global mode: with `cwd` outside a project, items from integrations installed next to this CLI package globally are searched too, and theme results name no step that adds a theme to an app; inside a project, only the project's own integrations count. See {@link namespace:global} and {@link generic:computer-integrations}.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'search(query: string, options?: SearchOptions): Promise<SearchResponse>',
  keywords: ['search', 'find', 'lookup', 'discover'],
  params: [
    {
      name: 'query',
      type: 'string',
      description: 'Free-text search term.',
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
    {
      name: 'options.cwd',
      type: 'string',
      description:
        "Directory to resolve @astryxdesign/core from: the project's installed Core, else, outside a project or in a project with nothing installed, the Core of the release that answers, installed into the per-user cache first when needed. A docs-only or themes-only search (`type: 'doc'` or `type: 'theme'`) does not need it. A search with no `type` covers the docs and themes alone only when that Core cannot be obtained, and then says so in `meta.partial`.",
    },
  ],
  returns: [
    {
      type: 'search',
      description:
        "The query echoed back, `matchCount` (how many candidates matched in total, before `limit`), plus a ranked SearchResultEntry[] bounded by `limit`: each has domain, name, score, reason, description, and follow-up command, plus `import` for components and hooks, `title` for docs, `displayName` and `kind` for templates, and `displayName` for themes. A doc result is the smallest part that answers: one section (with `section`, and a command that reads only it), one docs-tree route, or a topic, whose command lists its sections. `parent` is the command that opens the level above it: the section list of its topic, the namespace a tree node sits in, the topic level (Guides or Foundations) for a flat topic, or the topic list for a top-level namespace. Every doc result also carries `package`, the npm package that authored it (for a section, the package its file came from). A theme result is one theme you can import: `name` is its slug, its command is `{@command theme add <slug>}` (outside a project, where there is no app to add it to, `{@command theme eject <slug>}`), and `package` is the npm package that ships it (`@astryxdesign/cli` for the CLI's own themes). When a search with no `type` could not obtain @astryxdesign/core, `meta.partial` is `{skipped, reason}`: the domains it skipped (`component`, `hook`, `template`) and why; the results are the docs and themes, and text mode prints one line on standard error.",
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the query is empty, --type is unknown, or --limit is not a positive integer',
    },
    {
      code: 'ERR_CORE_NOT_FOUND',
      when: '@astryxdesign/core cannot be found from the cwd, and `type` names a domain that reads it: `component`, `hook`, or `template`',
    },
    {
      code: 'ERR_VERSIONS_UNAVAILABLE',
      when: "`type` names a domain that reads @astryxdesign/core, and outside a project, or in a project with nothing installed, the Core of the release that answers cannot be installed into the per-user cache; a search with no `type` answers with `meta.partial` instead",
    },
  ],
  examples: [
    {label: 'Find a component', code: "const r = await search('button');"},
    {
      label: 'Restrict + limit',
      code: "await search('data table', {type: 'template', limit: 5});",
    },
  ],
  command: 'search',
  related: ['component', 'hook', 'docs', 'template', 'build'],
};
