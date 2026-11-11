// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme undo`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme undo',
  displayName: 'astryx experimental theme undo',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'Put the theme back as it was before its last change',
  description:
    'Steps back one change: the settings file, the theme source and the build go back to how they were before the last set, unset, or base or mode change, and the preview is rewritten. The result names what was undone and how many earlier steps are left. Experimental: it may change or be removed in a patch release.',
  fn: 'themeEditUndo',
  args: [
    {
      name: 'theme',
      param: 'theme',
      required: true,
    },
  ],
  options: [
    {
      flag: '--png',
      param: 'options.png',
      description:
        'Also take PNG pictures of the previews (light and dark), with a Playwright installed in the project or a Chrome or Chromium found on the machine; without one, the result says how to get it. Nothing else changes',
    },
  ],
  examples: [
    {
      label: 'Step back',
      cli: 'astryx experimental theme undo brand',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme undo writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the last change is undone',
    },
    {
      code: 1,
      when: 'there is no earlier change, or the theme does not exist',
    },
  ],
  related: ['experimental theme', 'experimental theme compile'],
};
