// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx theme targets`. The terminal binding of the
 * `themeTargets()` function (referenced via `fn`); its args map to that
 * function's params so a converter can build Commander config + --help from one
 * source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'theme targets',
  displayName: 'astryx theme targets',
  namespace: 'cli/commands',
  summary: 'List the component theming targets a theme can override',
  description:
    'Prints every `defineTheme` components key across the system: the stable class it paints, ' +
    'the component that declares it, and the props and states that are legal override keys ' +
    'under it. This is the whole themeable surface in one command: what auditing a theme, or ' +
    'answering "which key paints this pixel?", used to need one `{@command component <Name>}` per ' +
    'component to assemble. Pass a component name to scope it; pass any other text to search ' +
    'target keys, classes, and components. `--json` for a list a repo can lint its own theme against.',
  fn: 'themeTargets',
  args: [{name: 'filter', param: 'filter', required: false}],
  examples: [
    {label: 'The whole themeable surface', cli: 'astryx theme targets'},
    {label: "One component's targets", cli: 'astryx theme targets Switch'},
    {label: 'Search keys', cli: 'astryx theme targets thumb'},
    {label: 'For a lint or an audit script', cli: 'astryx --json theme targets'},
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'success'},
    {code: 1, when: 'a filter matches no target, or core cannot be resolved'},
  ],
  related: ['component', 'theme build', 'theme template'],
};
