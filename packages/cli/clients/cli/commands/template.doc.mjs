// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx template`. The terminal binding of the
 * `template()` function (referenced via `fn`); its args/flags map to that
 * function's params so a converter can build Commander config + --help from one
 * source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'template',
  displayName: 'astryx template',
  namespace: 'cli/commands',
  summary: 'List, show, or scaffold page and block templates',
  description:
    'One entry point for the template family: with no name it lists the discovered ' +
    'templates; with a name it shows the source or a layout skeleton, or scaffolds it ' +
    'into the project at a target path. A configured integration replacement is the ' +
    'default for its Core id; use --package @astryxdesign/core for the original. ' +
    'Narrow other ambiguous names with --type and/or --package. --cdn writes the ' +
    'no-build-step CDN starter page, which ships as an asset rather than as a ' +
    'discovered template.',
  fn: 'template',
  args: [
    {
      name: 'name',
      param: 'name',
      required: false,
      description: 'Template id (see --list). Omit it to list the templates.',
    },
    {
      name: 'path',
      param: 'options.targetPath',
      required: false,
      description:
        'Where to scaffold the template, relative to the project root. A path that ends in .tsx, .ts, .jsx, .js, .mjs, .cjs, .css, .scss, .json, .md or .html is the file to write; ' +
        "any other path is a directory, which receives page.tsx for a page template or the block's own file name for a block. " +
        'Omit it to print the source.',
    },
  ],
  options: [
    {
      flag: '--list',
      param: 'options.list',
      description:
        'List available templates (narrow with --type and --package) and do nothing else: <name>, <path>, --skeleton and --overwrite are refused',
    },
    {
      flag: '--type <type>',
      param: 'options.type',
      choices: ['page', 'block'],
      description: 'Filter by template type: page or block',
    },
    {
      flag: '--package <pkg>',
      param: 'options.package',
      description:
        'Narrow to templates from a specific package. Use @astryxdesign/core to select an original hidden by an integration replacement.',
    },
    {
      flag: '--skeleton',
      param: 'options.skeleton',
      description:
        'Show layout skeleton with spatial annotations (padding, gap, nesting) instead of the source. Needs <name>. ' +
        'It writes nothing, so <path> and --overwrite are refused with ERR_INVALID_ARGUMENT',
    },
    {
      flag: '--cdn [path]',
      param: 'options.cdn',
      description:
        'Write the no-build-step CDN starter page and do nothing else: <name>, --list, --skeleton, --type and --package are refused. ' +
        'The page goes to the --cdn value, else to <path>, else cdn.template.html, and that path is always the file itself. ' +
        'A value right after --cdn (anything not starting with -) is taken as that path',
    },
    {
      flag: '-f, --overwrite',
      param: 'options.overwrite',
      description:
        'Replace an existing target file. Without it an existing file is refused (ERR_FILE_EXISTS) and an existing CDN page is left as is',
    },
  ],
  examples: [
    {label: 'List templates', cli: 'astryx template --json'},
    {
      label: 'List exact Core ids',
      cli: 'astryx --json template --list --package @astryxdesign/core',
    },
    {
      label: 'Scaffold into the app',
      cli: 'astryx template dashboard ./src/app',
    },
    {
      label: 'Select a replaced Core original',
      cli: 'astryx template shell-side-nav ./src/app --package @astryxdesign/core',
    },
    {label: 'CDN starter page', cli: 'astryx template --cdn'},
    {
      label: 'CDN starter page, elsewhere',
      cli: 'astryx template --cdn public/demo.html',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {
      code: 0,
      when: 'success, including a CDN page left untouched because it already exists',
    },
    {
      code: 1,
      when: 'unknown or ambiguous template, no source, a path escape, an existing target without --overwrite, or --list with a type outside page or block or a package that provides no templates',
    },
  ],
  related: ['component', 'search', 'discover', 'init'],
};
