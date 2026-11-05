// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx component`. The terminal binding of the
 * `component()` function (referenced via `fn`); its args/flags map to that
 * function's params so a converter can build Commander config + --help from one
 * source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'component',
  displayName: 'astryx component',
  namespace: 'cli/commands',
  summary: 'List components or print component docs',
  description:
    'Resolves one or several components by exact selector across core and integration ' +
    'packages and prints each authored doc, or lists the catalog grouped by category. ' +
    "Use 'Button', 'widgets/Button', '@acme/widgets/Button', or " +
    "'@acme/widgets@1.2.3/Button'. A version applies to the package and must match the " +
    'installed version. Boolean flags narrow every resolved component to just its props, ' +
    'source, showcase, or example blocks. An integration component that replaces a Core ' +
    'component (its doc sets replaces, and its package declares the CLI range that turns ' +
    'replacement on) answers to the Core name in detail, batch, and list views; use ' +
    '--package @astryxdesign/core for the original.',
  fn: 'component',
  args: [
    {
      name: 'names',
      param: 'name',
      description:
        'One or more exact selectors. Use Name, package/Name, @scope/package/Name, or @scope/package@version/Name. Two or more return one ordered batch. At most 100 selectors are accepted.',
      required: false,
      variadic: true,
    },
  ],
  options: [
    {
      flag: '--list',
      param: 'options.list',
      description: 'List every component (the same as giving no name)',
    },
    {
      flag: '--category <category>',
      param: 'options.category',
      description:
        'List one component group, e.g. --category Layout or --category Avatar (an unknown group lists the valid ones)',
    },
    {
      flag: '--props',
      param: 'options.props',
      description: 'Print only the props table',
    },
    {
      flag: '--source',
      param: 'options.source',
      description: 'Print component source code',
    },
    {
      flag: '--showcase',
      param: 'options.showcase',
      description: 'Print showcase source code',
    },
    {
      flag: '--blocks',
      param: 'options.blocks',
      description: 'List example blocks: showcase, examples, and related',
    },
    {
      flag: '--package <name>',
      param: 'options.package',
      description:
        'Scope lookup to an external package (e.g. @acme/xds-widgets). Use @astryxdesign/core to select an original replaced by an integration component.',
    },
  ],
  examples: [
    {label: 'Browse the catalog', cli: 'astryx component --list'},
    {
      label: 'Look up several components',
      cli: 'astryx component Button Badge Text',
    },
    {
      label: 'Props table as JSON',
      cli: 'astryx component Button --props --json',
    },
    {
      label: 'Select a replaced Core original',
      cli: 'astryx component SideNav --package @astryxdesign/core',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success'},
    {
      code: 1,
      when: 'unknown component, category, or package; more than 100 selectors; any batch row is unresolved; or @astryxdesign/core cannot be resolved',
    },
  ],
  related: ['search', 'hook', 'docs', 'template', 'swizzle'],
};
