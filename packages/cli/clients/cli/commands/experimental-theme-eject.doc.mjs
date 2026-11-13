// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx experimental theme eject`: the experimental
 * copy of `astryx theme eject`, with the same function, flags and output.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme eject',
  displayName: 'astryx experimental theme eject',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'Fork a theme as editable local source',
  description:
    "Copies a bundled or installed package theme's complete source into the local themes root, including a local descriptor. Writes are atomic. Existing files require --overwrite. Eject never writes into a folder that holds another theme or a theme the theme editor made, even with --overwrite. A subfolder of a folder the theme editor made is written, and the CLI warns; to keep the editor folder to its own theme, fork into the default folder or a path outside it. When the fork imports packages the app lacks, the result names them with an install command. Use --package when package themes share a slug.",
  fn: 'themeEject',
  args: [
    {
      name: 'slug',
      param: 'slug',
      required: true,
    },
    {
      name: 'path',
      param: 'options.targetPath',
      required: false,
    },
  ],
  options: [
    {
      flag: '-f, --overwrite',
      param: 'options.overwrite',
      description:
        'Replace the existing files of an earlier fork of the same theme. Without it, an existing file fails with ERR_FILE_EXISTS and nothing is written',
    },
    {
      flag: '--package <package>',
      param: 'options.package',
      description: 'Select the package that owns the theme',
    },
  ],
  examples: [
    {
      label: 'Fork a theme into the local root',
      cli: 'astryx experimental theme eject ocean',
    },
    {
      label: 'Fork one package theme elsewhere',
      cli: 'astryx experimental theme eject ocean src/themes/my-ocean --package @acme/themes',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {
      code: 0,
      when: 'all source and descriptor files are written',
    },
    {
      code: 1,
      when: 'the theme is unknown or ambiguous, a path escapes, a source file is missing, a destination exists, or the folder holds another theme',
    },
  ],
  related: [
    'experimental theme add',
    'experimental theme compile',
    'experimental theme list',
  ],
  replaces: ['theme eject'],
};
