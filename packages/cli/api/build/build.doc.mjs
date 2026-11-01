// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `build()` / `astryx build`. Colocated with the API
 * function it documents; the shape source of truth stays in `build.type.mjs`.
 * @position packages/cli/api/build — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'build',
  namespace: 'cli/api',
  displayName: 'build()',
  summary:
    'Page-building assistant: the how-to-build playbook, or the page template to start from for an idea.',
  description:
    'The "build a page" entry point. Called with no query it returns the ' +
    'how-to-build-a-page playbook as data: the workflow steps with their ' +
    'commands, the on-system rules, and related lookups. Called with a query it names the page template to ' +
    'START from (always one: the page template a ranker built for long descriptions puts first; for a part ' +
    'of a page, the page it names; else the app shell) and the next two templates, ' +
    'and the unified search grouped around it: the other close page templates, drop-in blocks, and ' +
    'idea-specific components/hooks, plus the always-on frame + foundation. A template carries the page ' +
    'frame and spacing, so the kit never recommends composing a page from components.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'build(query?: string, options?: BuildOptions): Promise<BuildHelpResponse | BuildKitResponse>',
  keywords: ['build', 'compose', 'assemble', 'page', 'kit', 'scaffold'],
  params: [
    {
      name: 'query',
      type: 'string',
      description:
        'What you\'re building (e.g. "analytics dashboard"). Omit for the how-to-build playbook.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'Directory to resolve @astryxdesign/core and templates from.',
      default: 'process.cwd()',
    },
    {
      name: 'options.type',
      type: "'component' | 'hook' | 'doc' | 'template'",
      description: 'Restrict the underlying search to a single domain.',
    },
    {
      name: 'options.limit',
      type: 'number',
      description:
        'Max results pulled from search before grouping into the kit.',
      default: '60',
    },
  ],
  returns: [
    {
      type: 'build.help',
      description:
        'Emitted when the query is omitted: the page-building playbook — `playbook: true`, a `title`, the ordered `steps` (each a `title`, its `commands`, and optionally what the step `returns`), the on-system `rules`, and `related` lookups. Each command is a bare subcommand ({command, purpose?}) for the caller to render with its own CLI invocation.',
    },
    {
      type: 'build.kit',
      description:
        "The page template to start from and the kit around it: the echoed query, hasResults/matchCount/directMatch fields, `start` (the template to scaffold, the `template <id> --type page <path>` command that selects it, whether the page ranker's pick is also search's direct match, the closest page, or the fallback app shell, the ranker's next two `alternatives`, and optional `notes` — setup notes naming what the template needs that the project lacks, such as missing packages or a missing StyleX compiler), search's closest page templates (≤3), drop-in block patterns (≤5), idea-specific components/hooks (≤6), and the always-on frame + foundation component-name arrays. Carries `hint` only when the kit came back thin — what to try instead, so a caller does not read a near-empty kit as \"the package has nothing\".",
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'a query is given and options.type is not a known domain, or options.limit is not a positive integer',
    },
    {
      code: 'ERR_CORE_NOT_FOUND',
      when: 'a query is given and @astryxdesign/core cannot be found from cwd',
    },
    {
      code: 'ERR_VERSIONS_UNAVAILABLE',
      when: 'a query is given outside a project, or in a project with nothing installed, and the Core of the release that answers is not beside it or cached, and cannot be installed into the per-user cache (offline, a registry without it, or an unwritable cache)',
    },
  ],
  examples: [
    {label: 'Get the playbook', code: 'const r = await build();'},
    {
      label: 'Find the template to start from',
      code: "const {data} = await build('analytics dashboard');\n// data.start.command: 'astryx template dashboard --type page <path>'",
    },
    {
      label: 'Restrict + limit',
      code: "await build('pricing', {type: 'template', limit: 10});",
    },
  ],
  command: 'build',
  related: ['search', 'template', 'component', 'hook', 'init'],
};
