// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx swizzle`. The terminal binding of the `swizzle()`
 * function (referenced via `fn`); its args/flags map to that function's params
 * so a converter can build Commander config + --help from one source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'swizzle',
  displayName: 'astryx swizzle',
  namespace: 'cli/commands',
  summary: 'Copy component source for customization',
  description:
    "Ejects a component's source from the resolved @astryxdesign/core (or its owning " +
    'integration) into your project for deep customization, rewriting imports that ' +
    'escape the component directory. With no name it lists the swizzlable components. ' +
    'An integration component that replaces a Core component is what that Core name ' +
    'copies; --package @astryxdesign/core copies the original. --list lists Core ' +
    'components, including one an integration replaces.',
  fn: 'swizzle',
  args: [{name: 'component', param: 'component', required: false}],
  options: [
    {
      flag: '--output <dir>',
      param: 'options.output',
      default: './components/astryx',
      description: 'Output directory',
    },
    {
      flag: '--package <pkg>',
      param: 'options.package',
      description:
        'Scope to a specific owning package. Use @astryxdesign/core to copy an original replaced by an integration component',
    },
    {
      flag: '--list',
      param: 'options.list',
      description:
        'List the swizzlable Core components, including any that an integration component replaces',
    },
    {
      flag: '-f, --overwrite',
      param: 'options.overwrite',
      description:
        'Replace existing files. Without it, existing files fail the command with ERR_FILE_EXISTS and nothing is written',
    },
  ],
  examples: [
    {label: 'List swizzlable components', cli: 'astryx swizzle --list'},
    {label: 'Eject a component', cli: 'astryx swizzle Button'},
    {
      label: 'Copy a replaced Core original',
      cli: 'astryx swizzle SideNav --package @astryxdesign/core',
    },
  ],
  outsideProject: 'refuse',
  exitCodes: [
    {code: 0, when: 'success'},
    {
      code: 1,
      when: 'unknown or ambiguous component, no source on disk, a path escape, or existing files without --overwrite',
    },
  ],
  related: ['component', 'discover', 'upgrade'],
  notes: [
    {
      type: 'prose',
      text: 'In global mode: outside a project, swizzle writes nothing and stops with `ERR_CORE_NOT_FOUND`: "Could not find @astryxdesign/core package. Make sure you are inside the design system monorepo or have @astryxdesign/core installed." In a project, the project\'s version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.',
    },
  ],
};
