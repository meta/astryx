// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx theme eject`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'theme eject',
  displayName: 'astryx theme eject',
  namespace: 'cli/commands',
  summary: 'Fork a theme as editable local source',
  description:
    "Copies a bundled or installed package theme's complete source into the local themes root, including a local descriptor. Writes are atomic. Existing files require --overwrite. Use --package when package themes share a slug.",
  fn: 'themeEject',
  args: [
    {name: 'slug', param: 'slug', required: true},
    {name: 'path', param: 'options.targetPath', required: false},
  ],
  options: [
    {
      flag: '-f, --overwrite',
      param: 'options.overwrite',
      description:
        'Replace existing files. Without it, an existing file fails with ERR_FILE_EXISTS and nothing is written',
    },
    {
      flag: '--package <package>',
      param: 'options.package',
      description: 'Select the package that owns the theme',
    },
  ],
  examples: [
    {label: 'Fork a theme into the local root', cli: 'astryx theme eject ocean'},
    {
      label: 'Fork one package theme elsewhere',
      cli: 'astryx theme eject ocean src/themes/my-ocean --package @acme/themes',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {code: 0, when: 'all source and descriptor files are written'},
    {
      code: 1,
      when: 'the theme is unknown or ambiguous, a path escapes, a source file is missing, or a destination exists',
    },
  ],
  related: ['theme add', 'theme build', 'theme list'],
};
