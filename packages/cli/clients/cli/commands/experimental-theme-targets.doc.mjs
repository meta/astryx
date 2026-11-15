// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx experimental theme targets`: the experimental
 * copy of `astryx theme targets`, with the same function, flags and output.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme targets',
  displayName: 'astryx experimental theme targets',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'List the component theming targets a theme can override',
  description:
    'Prints every `defineTheme` components key across the system: the stable class it paints, the component that declares it, and the props and states that are legal override keys under it. This is the whole themeable surface in one command: what auditing a theme, or answering "which key paints this pixel?", used to need one `{@command component <Name>}` per component to assemble. Pass a component name to scope it; pass any other text to search target keys, classes, and components. `--json` for a list a repo can lint its own theme against.',
  fn: 'themeTargets',
  args: [
    {
      name: 'filter',
      param: 'filter',
      required: false,
    },
  ],
  examples: [
    {
      label: 'The whole themeable surface',
      cli: 'astryx experimental theme targets',
    },
    {
      label: "One component's targets",
      cli: 'astryx experimental theme targets Switch',
    },
    {
      label: 'Search keys',
      cli: 'astryx experimental theme targets thumb',
    },
    {
      label: 'For a lint or an audit script',
      cli: 'astryx --json experimental theme targets',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {
      code: 0,
      when: 'success',
    },
    {
      code: 1,
      when: 'a filter matches no target, or core cannot be resolved',
    },
  ],
  related: [
    'component',
    'experimental theme compile',
    'experimental theme template',
  ],
  replaces: ['theme targets'],
};
