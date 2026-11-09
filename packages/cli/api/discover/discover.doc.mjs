// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `discover()` / `astryx discover`. Colocated with the API
 * function it documents; the shape source of truth stays in `discover.type.mjs`.
 * @position packages/cli/api/discover — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'discover',
  namespace: 'cli/api',
  displayName: 'discover()',
  summary:
    'Browse and search integrations: the ones a project has and, through the official list and discover sources, the ones it could add.',
  description:
    'Lists the integrations a project loads and the official packages it declares, then the packages it could add: ' +
    'the official Astryx packages first, from the list the CLI carries, then whatever the discover sources of the ' +
    'project and its integrations list, with what each one adds per kind. An @scope/name query shows one package with every ' +
    'version its source knows; @scope/name@version shows one version; @scope/name/Component returns an installed ' +
    "component's validated doc, and any other item path returns that item. A free-text term searches every item and " +
    'package. Discover only reads: it prints the command that adds a package and never runs it.' +
    " In global mode: with `cwd` outside a project, integrations installed next to this CLI package globally are listed as installed; inside a project, only the project's own are, and the compatible global ones are listed in `meta.available` with source `installed for this computer` and an `install` command. See {@link namespace:global} and {@link generic:computer-integrations}.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'discover(query?: string, options?: DiscoverOptions): Promise<DiscoverListResponse | DiscoverDetailResponse | DiscoverDetailDocResponse | DiscoverItemResponse | DiscoverSearchResponse>',
  keywords: [
    'discover',
    'packages',
    'integrations',
    'external',
    'components',
    'catalog',
    'versions',
    'search',
  ],
  params: [
    {
      name: 'query',
      type: 'string',
      description:
        'A package (@scope/name, optionally @version), an item path (@scope/name/<item>), or a free-text term. Omit to list packages.',
    },
    {
      name: 'options.components',
      type: 'boolean',
      description:
        'In the CLI package list, print every component, and every other item, of each package instead of the first 10. A display flag for the CLI renderer; the programmatic response is unchanged.',
    },
    {
      name: 'options.type',
      type: "'component' | 'template' | 'doc' | 'theme' | 'codemod' | 'agent-doc'",
      description:
        'Only one kind: in the list, packages that add it; in a search, items of that kind.',
    },
    {
      name: 'options.installed',
      type: 'boolean',
      description:
        'Only what the project has. Cannot be set with options.available.',
      default: 'false',
    },
    {
      name: 'options.available',
      type: 'boolean',
      description:
        'Only what the project could add. Cannot be set with options.installed.',
      default: 'false',
    },
    {
      name: 'options.limit',
      type: 'number',
      description: 'Max number of search results, a positive integer.',
      default: '20',
    },
    {
      name: 'options.lang',
      type: 'string',
      description: 'Language code to translate a resolved component doc into.',
    },
    {
      name: 'options.zh',
      type: 'boolean',
      description: 'Return a resolved component doc in Chinese.',
      default: 'false',
    },
  ],
  returns: [
    {
      type: 'discover.list',
      description:
        'What the project has: the integrations it loads and the official packages it declares (package, the npm package and always equal to name; name, category, components, version, and a list per other kind they add), official packages first. meta.available lists what the project could add, official packages first, each with its package and the command that adds it; inside a project, an integration installed for the computer that the project does not install is listed there too, with source `installed for this computer` and the install command for the project in `install`. meta.sources reports each source, the official list last. When it lists no integration it carries meta.configured.',
    },
    {
      type: 'discover.detail',
      description:
        "One package: its package (the npm package the result is about), what the shown version adds, whether the project has it, its versions and latest release when a source knows them, and the command that adds it when the project does not have it. An entry from the official list lists the newest release this CLI knows as latest and the project's Core version; its add command pins the project's Core version, else the Core range it declares (quoted), else the latest release. A version or item the official list does not show answers ERR_UNKNOWN_PACKAGE.",
    },
    {
      type: 'discover.detail.doc',
      description:
        'The validated ComponentDoc for one installed component, for an @scope/name/Component query, plus package, the npm package that owns the component.',
    },
    {
      type: 'discover.item',
      description:
        'One item that is not an installed component: its kind, name, the package and version that add it, and whether the project has the package. The envelope\'s package names the same package.',
    },
    {
      type: 'discover.search',
      description:
        'The query echoed back plus every matching item and package, each with its kind and whether the project has it, even when one name matches exactly or only one item matches; total is set when the limit cut the list.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'the query is a non-string value, or a free-text search is run with an empty query',
    },
    {
      code: 'ERR_INVALID_OPTION',
      when: 'options.type is not a known kind, options.limit is not a positive integer, or options.installed and options.available are both set',
    },
    {
      code: 'ERR_UNKNOWN_PACKAGE',
      when: 'neither the project, the official list, nor any discover source has the package',
    },
    {
      code: 'ERR_UNKNOWN_COMPONENT',
      when: 'the item is not in the named package',
    },
    {
      code: 'ERR_NOT_FOUND',
      when: 'a free-text term matches nothing, or the requested version is not published',
    },
    {
      code: 'ERR_INVALID_DOC',
      when: "the resolved component's docs fail to load or are malformed",
    },
  ],
  examples: [
    {label: 'List packages', code: 'const {data, meta} = await discover();'},
    {label: 'Browse a package', code: "await discover('@acme/ui');"},
    {label: 'One version', code: "await discover('@acme/ui@2.1.0');"},
    {label: 'Show a component doc', code: "await discover('@acme/ui/Button');"},
    {
      label: 'Search templates to add',
      code: "await discover('dashboard', {type: 'template', available: true});",
    },
  ],
  command: 'discover',
  related: ['component', 'search', 'template'],
};
