// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `hook()` / `astryx hook`. Colocated with the API
 * function it documents; the shape source of truth stays in `hook.type.mjs`.
 * @position packages/cli/api/hook — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'hook',
  namespace: 'cli/api',
  displayName: 'hook()',
  summary:
    'Resolve a hook by name, or list the catalog, with an optional params-only slice.',
  description:
    "Routes on its arguments: a name returns that hook's full authored HookDoc; " +
    'no name (or `list`/`category`) returns the catalog grouped by category. The ' +
    '`params` flag narrows a single hook to just its parameters table.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'hook(name?: string, options?: HookOptions): Promise<HookListResponse | HookDetailResponse | HookDetailParamsResponse>',
  keywords: ['hook', 'hooks', 'params', 'react', 'catalog'],
  params: [
    {
      name: 'name',
      type: 'string',
      description:
        "Hook name to resolve (e.g. 'useMediaQuery'). Omit to list the catalog.",
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
      description: 'Return the grouped catalog instead of a single hook.',
    },
    {
      name: 'options.category',
      type: 'string',
      description:
        "List only the hooks in this category, a key of the unfiltered list such as 'Media' or 'Focus'.",
    },
    {
      name: 'options.params',
      type: 'boolean',
      description: "Return only the hook's parameters table.",
    },
    {
      name: 'options.detail',
      type: "'full' | 'compact' | 'brief'",
      description: 'Detail level for list views.',
      default:
        "'full' for a named hook; 'brief' for lists (returned as data.detail: 'names')",
    },
    {
      name: 'options.lang',
      type: 'string',
      description: 'Language code for localized doc content.',
    },
    {
      name: 'options.zh',
      type: 'boolean',
      description: 'Shorthand for Chinese (zh) doc content.',
    },
  ],
  returns: [
    {
      type: 'hook.list',
      description:
        "The catalog grouped by category. data.detail is the level ('names' | 'compact' | 'full') and data.components is the grouped map: hook names, brief entries, or full HookDoc per entry.",
    },
    {
      type: 'hook.detail',
      description: "One hook's full authored HookDoc.",
    },
    {
      type: 'hook.detail.params',
      description: "Just the hook's parameters table (HookParamDoc[]).",
    },
  ],
  throws: [
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
      when: 'options.category is not a string or matches no known category',
    },
    {
      code: 'ERR_UNKNOWN_HOOK',
      when: 'name is not a string or resolves to no known hook',
    },
  ],
  examples: [
    {label: 'Look up a hook', code: "const r = await hook('useMediaQuery');"},
    {
      label: 'Params only',
      code: "await hook('useMediaQuery', {params: true});",
    },
    {
      label: 'Browse a category',
      code: "await hook(undefined, {category: 'Media', detail: 'compact'});",
    },
  ],
  command: 'hook',
  related: ['search', 'component', 'docs', 'template'],
};
