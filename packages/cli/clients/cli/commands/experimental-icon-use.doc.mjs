// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental icon use`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental icon use',
  displayName: 'astryx experimental icon use',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: "Choose the project's icon set",
  description:
    "Writes `experimental.iconSet` in astryx.config, so copied templates and blocks use that set's icons. The set must be installed. Experimental: it may change or be removed in a patch release.",
  fn: 'iconUse',
  args: [{name: 'set', param: 'set', required: true}],
  examples: [
    {label: 'Use a set', cli: 'astryx experimental icon use outline'},
    {
      label: 'Name its package',
      cli: 'astryx experimental icon use @acme/icons/outline',
    },
  ],
  outsideProject: 'refuse',
  exitCodes: [
    {
      code: 0,
      when: 'experimental.iconSet is written, or already names the set',
    },
    {
      code: 1,
      when: 'the set is not installed, two packages ship it, the config cannot be updated (not a static object literal, or it spreads another object, which you then edit by hand), or the config is protected (a symbolic link, or marked generated, vendored, or ignored: `ERR_CODEMOD_PROTECTED`, naming the declaration)',
    },
  ],
  related: ['experimental icon', 'template'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental icon use writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
};
