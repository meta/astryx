// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx discover`. The terminal binding of the
 * `discover()` function (referenced via `fn`); its args/flags map to that
 * function's params so a converter can build Commander config + --help from one
 * source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'discover',
  displayName: 'astryx discover',
  namespace: 'cli/commands',
  summary:
    'Browse and search integrations: the ones you have and the ones you could add',
  description:
    'Lists what this project has, the integrations it loads and the official packages it declares, then what it could add: the official Astryx packages first, then whatever its discover sources list, with what each one adds. ' +
    'Inside a project, integrations installed for the computer, beside the CLI installed for it, are listed as ones the project could add, with its install command; outside one they load. ' +
    'A package query shows one package: what it adds, every version a source knows, and the command that adds it. ' +
    "An @scope/name/Component path prints an installed component's doc; any other item path shows that item. " +
    'Anything else, even an exact component name, searches every item and package and lists the matches. Discover only reads: your package manager installs, updates, and removes packages.',
  fn: 'discover',
  args: [{name: 'query', param: 'query', required: false}],
  options: [
    {
      flag: '--components',
      param: 'options.components',
      description:
        'In the package list, print every component, and every other item, of each package instead of the first 10 and a "+N more" count. No effect on --json output or on a package, component, or search query.',
    },
    {
      flag: '--type <kind>',
      param: 'options.type',
      description:
        'Only one kind: component, template, doc, theme, codemod, or agent-doc. In the list, only packages that add it; in a search, only items of that kind.',
    },
    {
      flag: '--installed',
      param: 'options.installed',
      description:
        'Only what this project has. Cannot be set with --available.',
    },
    {
      flag: '--available',
      param: 'options.available',
      description:
        'Only what this project could add. Cannot be set with --installed.',
    },
    {
      flag: '--limit <n>',
      param: 'options.limit',
      description:
        'Max number of search results, a positive integer (default 20).',
    },
  ],
  examples: [
    {
      label: 'List what you have and what you could add',
      cli: 'astryx discover',
    },
    {
      label: 'List every component of each package',
      cli: 'astryx discover --components',
    },
    {
      label: 'Only packages that add themes',
      cli: 'astryx discover --type theme',
    },
    {
      label: 'Browse a package and its versions',
      cli: 'astryx discover @acme/ui',
    },
    {label: 'See one version', cli: 'astryx discover @acme/ui@2.1.0'},
    {
      label: 'Search templates you could add',
      cli: 'astryx discover dashboard --type template --available',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success'},
    {
      code: 1,
      when: 'unknown package, version, component, or item; a malformed doc; an invalid --type or --limit; --installed with --available; or a blank query when packages are discovered',
    },
  ],
  related: ['component', 'search', 'template'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, integrations installed next to your global install are listed as installed and their items show up; inside a project, only the project's integrations are, and the global ones the project could add are listed under available, with the project's install command. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:computer-integrations}.",
    },
  ],
};
