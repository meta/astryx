// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme preview list`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme preview list',
  displayName: 'astryx experimental theme preview list',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'The pages of the theme preview in the app',
  description:
    'Lists the pages of the theme preview, in nav order, with the theme they wear and the route folder. With no preview, and with no routes folder for one, it says so and how to add one (the JSON list is empty). Experimental: it may change or be removed in a patch release.',
  fn: 'themeEditPreviewList',
  options: [
    {
      flag: '--path <dir>',
      param: 'options.path',
      description:
        'The folder of the preview route, when it is not in the default place',
    },
  ],
  examples: [
    {
      label: 'Every page',
      cli: 'astryx experimental theme preview list',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme preview list writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the pages are listed (none included)',
    },
    {
      code: 1,
      when: 'outside a project',
    },
  ],
  related: ['experimental theme preview'],
};
