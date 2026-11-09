// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx hook`. The terminal binding of the `hook()`
 * function (referenced via `fn`); its args/flags map to that function's params
 * so a converter can build Commander config + --help from one source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'hook',
  displayName: 'astryx hook',
  namespace: 'cli/commands',
  summary: 'List hooks or print hook docs',
  description:
    'Resolves a hook by name and prints its authored doc, or lists the catalog grouped ' +
    'by category. The --params flag narrows a single hook to just its parameters table.',
  fn: 'hook',
  args: [{name: 'name', param: 'name', required: false}],
  options: [
    {
      flag: '--list',
      param: 'options.list',
      description: 'List all hooks grouped by category',
    },
    {
      flag: '--category <category>',
      param: 'options.category',
      description: 'List hooks in a specific category',
    },
    {
      flag: '--params',
      param: 'options.params',
      description: 'Print only the parameters table',
    },
  ],
  examples: [
    {label: 'Browse the catalog', cli: 'astryx hook --list'},
    {label: 'One hook as JSON', cli: 'astryx hook useFocusTrap --json'},
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success'},
    {
      code: 1,
      when: 'unknown hook or category, or @astryxdesign/core cannot be resolved',
    },
  ],
  related: ['search', 'component', 'docs', 'template'],
};
