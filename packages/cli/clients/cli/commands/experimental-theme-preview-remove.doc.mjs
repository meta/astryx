// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme preview remove`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme preview remove',
  displayName: 'astryx experimental theme preview remove',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'Remove one page from the theme preview, or the whole preview',
  description:
    'Removes one page and its nav item, and rewrites the route. With no page, or for the last page, it removes the whole preview: only the files the preview wrote (theme-preview.json lists them) are deleted, and the folder only when nothing else is in it. A path in theme-preview.json that leads outside the route folder is refused before anything is deleted. Experimental: it may change or be removed in a patch release.',
  fn: 'themeEditPreviewRemove',
  args: [
    {
      name: 'page',
      param: 'page',
      required: false,
    },
  ],
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
      label: 'One page',
      cli: 'astryx experimental theme preview remove components',
    },
    {
      label: 'The whole preview',
      cli: 'astryx experimental theme preview remove',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme preview remove writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the page or the preview is removed',
    },
    {
      code: 1,
      when: 'there is no preview, it has no such page, theme-preview.json names a file outside the route folder, or outside a project',
    },
  ],
  related: ['experimental theme preview'],
};
