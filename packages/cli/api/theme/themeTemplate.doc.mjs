// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file FunctionDoc for `themeTemplate()` / `astryx theme template`. Colocated with the
 * API function it documents; the response-shape source of truth stays in
 * `theme.type.mjs`.
 * @position packages/cli/api/theme — function documentation
 */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeTemplate',
  namespace: 'cli/api',
  displayName: 'themeTemplate()',
  summary: 'Write the annotated theme template into a project.',
  description:
    'Writes theme.template.ts: the annotated reference for the whole theme surface, covering every ' +
    'defineTheme field, the token families, the component override syntax, and how a theme is ' +
    'consumed, with the CLI command that prints the authoritative reference for each section. ' +
    'Read it, copy what you need into your own theme file, delete it. Use `theme add` to ' +
    'use an installed built theme, extend that theme for ordinary customization, or use ' +
    '`theme eject` for a complete source fork. This command starts a new blank theme. Refuses to overwrite without ' +
    '`overwrite`, so it is safe to re-run.',
  importPath: '@astryxdesign/cli/api',
  signature:
    'themeTemplate(options?: {targetPath?: string, overwrite?: boolean, cwd?: string}): ThemeTemplateResponse',
  keywords: ['theme', 'template', 'starter', 'defineTheme', 'scaffold', 'reference', 'tokens'],
  params: [
    {
      name: 'options.targetPath',
      type: 'string',
      description: 'Destination file. Must resolve within cwd.',
      default: "'theme.template.ts'",
    },
    {
      name: 'options.overwrite',
      type: 'boolean',
      description: 'Replace an existing file instead of reporting it untouched.',
      default: 'false',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Directory the target path resolves against.',
      default: 'process.cwd()',
    },
  ],
  returns: [
    {
      type: 'theme.template',
      description:
        'Receipt: the path (relative to cwd), whether it was written, and the reason it was not. `exists` when a file was already there, which is a success, not a failure.',
    },
  ],
  throws: [
    {code: 'ERR_PATH_TRAVERSAL', when: 'the target path escapes cwd'},
    {code: 'ERR_WRITE_FAILED', when: 'the template file cannot be written'},
  ],
  examples: [
    {label: 'Write it at the project root', code: 'themeTemplate();'},
    {
      label: 'Somewhere else, replacing what is there',
      code: "themeTemplate({targetPath: 'src/themes/template.ts', overwrite: true});",
    },
  ],
  command: 'theme template',
  related: ['themeAdd', 'themeEject', 'themeBuild', 'themeListAvailable', 'themeTargets'],
};
