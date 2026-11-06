// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `component()` / `astryx component`. Colocated with the
 * API function it documents; the shape source of truth stays in
 * `component.type.mjs`.
 * @position packages/cli/api/component — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'component',
  namespace: 'cli/api',
  displayName: 'component()',
  summary:
    'Resolve one or several components by name, or list the catalog, with optional focused slices (props, source, showcase, blocks).',
  description:
    'Routes on its arguments: one string resolves that component across core and ' +
    'integration packages; an array returns one ordered result row per selector at ' +
    'every array length; and no name returns the catalog grouped by category. ' +
    'Boolean flags narrow each resolved component to just its props, source, ' +
    'showcase, or example blocks. An integration component that replaces a Core ' +
    'component (its doc sets replaces, and its package declares the CLI range that ' +
    'turns replacement on) answers to the Core name in detail, batch, and list ' +
    "results; use options.package '@astryxdesign/core' for the original." +
    " In global mode: with `cwd` outside a project, components from integrations installed next to this CLI package globally resolve too; inside a project, only the project's own integrations count. See {@link namespace:global} and {@link generic:computer-integrations}.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'component(name?: string | string[], options?: ComponentOptions): Promise<ComponentListResponse | ComponentBatchResponse | ComponentDetailResponse | ComponentDetailPropsResponse | ComponentDetailSourceResponse | ComponentDetailShowcaseResponse | ComponentDetailBlocksResponse>',
  keywords: [
    'component',
    'components',
    'props',
    'source',
    'showcase',
    'blocks',
    'catalog',
  ],
  params: [
    {
      name: 'name',
      type: 'string | string[]',
      description:
        "Pass one selector string for the existing single-result response, or an array of at most 100 selectors for an ordered component.batch response. The limit counts duplicates in every projection mode. An array always requests a batch, including [] and ['Button']. Use 'Button', 'widgets/Button', '@acme/widgets/Button', or '@acme/widgets@1.2.3/Button'. A version applies to the package and must match the installed version. Omit the argument to list the catalog.",
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Directory to resolve @astryxdesign/core from.',
      default: 'process.cwd()',
    },
    {
      name: 'options.list',
      type: 'boolean',
      description: 'Return the grouped catalog instead of a single component.',
    },
    {
      name: 'options.category',
      type: 'string',
      description:
        "List only the components in this group: a key of the unfiltered list (each component's group field), such as 'Layout' or 'Button'. It is not the category field of a component detail.",
    },
    {
      name: 'options.package',
      type: 'string',
      description:
        "Scope lookup to a specific external package (e.g. '@acme/widgets'). Use '@astryxdesign/core' to select an original replaced by an integration component.",
    },
    {
      name: 'options.props',
      type: 'boolean',
      description: "Return only the component's props table.",
    },
    {
      name: 'options.source',
      type: 'boolean',
      description: "Return the component's source file.",
    },
    {
      name: 'options.showcase',
      type: 'boolean',
      description: "Return the component's showcase example.",
    },
    {
      name: 'options.blocks',
      type: 'boolean',
      description:
        "Return the component's example blocks (showcase, examples, related).",
    },
    {
      name: 'options.detail',
      type: "'full' | 'compact' | 'brief'",
      description: 'Detail level for list views.',
      default:
        "'full' for a named component; 'brief' for lists (returned as data.detail: 'names')",
    },
    {
      name: 'options.lang',
      type: 'string',
      description:
        "Language code for localized doc content: 'en', 'zh', or 'dense'.",
    },
    {
      name: 'options.zh',
      type: 'boolean',
      description: 'Shorthand for Chinese (zh) doc content.',
    },
    {
      name: 'options.dense',
      type: 'boolean',
      description: 'Return the token-efficient dense doc variant.',
    },
  ],
  returns: [
    {
      type: 'component.list',
      description:
        "The catalog grouped by component group. data.detail is the level ('names' | 'compact' | 'full') and data.components is the grouped map: names entries with name, package, and an optional canonical import for integration and legacy package components; brief entries; or full ComponentDoc entries.",
    },
    {
      type: 'component.batch',
      description:
        'An explicit selector array returns one ordered receipt at every array length: count and one results row per selector, including duplicates. ComponentBatchResponse specializes the shared BatchResponse and BatchRow types. Each row carries selector and status (found, not_found, ambiguous, or error); found rows carry the single-selector result, ambiguous rows carry installed candidates ({package, component, kind, installed}), and failed rows carry code, error, and optional suggestions.',
    },
    {
      type: 'component.detail',
      description:
        "One component's authored ComponentDoc plus ownership metadata (owner package, import specifier, whether source is available). When the name is a sub-component documented in a parent's doc, the payload is scoped to it and parentDoc names that parent.",
    },
    {
      type: 'component.detail.props',
      description: "Just the component's props table (ComponentPropDoc[]).",
    },
    {
      type: 'component.detail.source',
      description: "The component's source file, as {component, source}.",
    },
    {
      type: 'component.detail.showcase',
      description:
        "The component's showcase example, as {component, aspectRatio, source}.",
    },
    {
      type: 'component.detail.blocks',
      description:
        "The component's example blocks, as {component, showcase, examples, related} of BlockEntry.",
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'a selector array has more than 100 entries, a package-shaped selector has no component item, or its package conflicts with options.package',
    },
    {
      code: 'ERR_INVALID_DETAIL',
      when: "options.detail is not 'full', 'compact', or 'brief'",
    },
    {
      code: 'ERR_INVALID_LANG',
      when: "options.lang is set to anything other than 'en', 'zh', or 'dense'",
    },
    {
      code: 'ERR_CORE_NOT_FOUND',
      when: '@astryxdesign/core cannot be resolved from cwd',
    },
    {
      code: 'ERR_VERSIONS_UNAVAILABLE',
      when: 'outside a project, or in a project with nothing installed, the Core of the release that answers is not beside it or cached, and cannot be installed into the per-user cache (offline, a registry without it, or an unwritable cache)',
    },
    {
      code: 'ERR_UNKNOWN_CATEGORY',
      when: 'options.category is not a string or matches no component group',
    },
    {
      code: 'ERR_UNKNOWN_COMPONENT',
      when: 'name is not a string, resolves to no known component, or is absent from the requested options.package',
    },
    {
      code: 'ERR_AMBIGUOUS_COMPONENT',
      when: 'the component is provided by multiple packages (pass options.package to disambiguate)',
    },
    {
      code: 'ERR_UNKNOWN_PACKAGE',
      when: 'options.package names a legacy external package that cannot be found, or a package-qualified selector requests a version that is not installed',
    },
    {
      code: 'ERR_NO_DOC',
      when: 'the resolved component has no .doc.mjs typed doc file',
    },
    {
      code: 'ERR_INVALID_DOC',
      when: "the resolved component's .doc.mjs fails to load or validate",
    },
    {
      code: 'ERR_NO_SOURCE',
      when: 'options.source is set but the component has no source file',
    },
    {
      code: 'ERR_NO_SHOWCASE',
      when: 'options.showcase is set but the component has no showcase',
    },
  ],
  examples: [
    {
      label: 'Look up a component',
      code: "const r = await component('Button');",
    },
    {
      label: 'Look up several components',
      code: "await component(['Button', 'Badge']);",
    },
    {label: 'Props only', code: "await component('Button', {props: true});"},
    {
      label: 'Browse one group',
      code: "await component(undefined, {category: 'Layout', detail: 'compact'});",
    },
  ],
  command: 'component',
  related: ['search', 'hook', 'docs', 'template', 'swizzle'],
};
