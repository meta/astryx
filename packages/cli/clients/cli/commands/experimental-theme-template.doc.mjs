// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx experimental theme template`: the experimental
 * copy of `astryx theme template`, with the same function, flags and output.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme template',
  displayName: 'astryx experimental theme template',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'Write the annotated theme template into your project',
  description:
    'Writes theme.template.ts: the annotated reference for the whole theme surface, covering every defineTheme field, the token families, the component override syntax, and how a theme is consumed, naming the CLI command that prints the authoritative reference for each. Read it, copy what you need into your own theme file, delete it. Use `experimental theme add <slug>` to use an installed built theme, extend that theme for ordinary customization, or use `experimental theme eject <slug>` for a complete source fork. The path is a .ts file, never a folder. Leaves an existing file untouched unless --overwrite, which replaces only an earlier copy of the template or a file named like a theme source (`*.theme.ts`, `*Theme.ts`, `*.template.ts`).',
  fn: 'themeTemplate',
  args: [
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
        'Replace an existing copy of the template or theme source file. Any other file, such as package.json, or a file in a folder the theme editor made, fails with ERR_FILE_EXISTS and is left as it was',
    },
  ],
  examples: [
    {
      label: 'Write it at the project root',
      cli: 'astryx experimental theme template',
    },
    {
      label: 'Somewhere else',
      cli: 'astryx experimental theme template src/themes/starter.ts',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {
      code: 0,
      when: 'success, including when an existing file was left untouched',
    },
    {
      code: 1,
      when: 'the target path escapes the project, is blank, a folder or not a .ts file, --overwrite names a file that is not a theme template or source, or the file cannot be written',
    },
  ],
  related: [
    'experimental theme add',
    'experimental theme eject',
    'experimental theme list',
    'experimental theme compile',
  ],
  replaces: ['theme template'],
};
