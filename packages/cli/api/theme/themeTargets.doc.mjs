// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `themeTargets()` / `astryx theme targets`. Colocated
 * with the API function it documents; the response-shape source of truth stays
 * in `theme.type.mjs`.
 * @position packages/cli/api/theme — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeTargets',
  namespace: 'cli/api',
  displayName: 'themeTargets()',
  summary: 'List every component theming target a theme can override.',
  description:
    'Enumerates the whole themeable surface: each `defineTheme` components key, the stable ' +
    'class it paints, the component that declares it, and the props and states that are legal ' +
    'override keys under it. Same source as the Theming table `{@command component <Name>}` prints ' +
    '(the component docs), so the list cannot drift from the components, and `theme build` ' +
    'validates overrides against this exact set. A filter naming a component gives that ' +
    "component's set; anything else is a case-insensitive substring search over each target's key, class and component.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'themeTargets(filter?: string, ctx?: {cwd?: string}): Promise<ThemeTargetsResponse>',
  keywords: [
    'theme',
    'targets',
    'defineTheme',
    'components',
    'override',
    'class',
    'states',
    'audit',
  ],
  params: [
    {
      name: 'filter',
      type: 'string',
      description:
        'A component name (exact, case-insensitive), or a substring of a target key, class or component. Omit for the whole surface.',
    },
    {
      name: 'ctx.cwd',
      type: 'string',
      description:
        "Directory the project's @astryxdesign/core is resolved from.",
      default: 'process.cwd()',
    },
  ],
  returns: [
    {
      type: 'theme.targets',
      description:
        'The echoed filter, how many components are represented, and the targets: each {key, className, component, props, states}.',
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
    {code: 'ERR_UNKNOWN_COMPONENT', when: 'a filter matches no target'},
  ],
  examples: [
    {label: 'The whole themeable surface', code: 'await themeTargets();'},
    {label: "One component's targets", code: "await themeTargets('Switch');"},
  ],
  command: 'theme targets',
  related: ['themeBuild', 'themeTemplate', 'component'],
};
