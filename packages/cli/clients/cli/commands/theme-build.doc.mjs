// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for `astryx theme build`. The terminal binding of the
 * `themeBuild()` function (referenced via `fn`); its args/flags map to that
 * function's params so a converter can build Commander config + --help from one
 * source of truth.
 * @position packages/cli/clients/cli/commands — command documentation
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'theme build',
  displayName: 'astryx theme build',
  namespace: 'cli/commands',
  summary: 'Compile standalone themes or one keyed theme family',
  description:
    'Compiles defineTheme() sources through the same theme pipeline into scoped CSS, ' +
    'standard ESM, and type declarations. Ordinary mode writes one complete set per ' +
    'theme. --family combines one selected extension tree into the three files named by ' +
    'the required --family-key, ready for one CSS load and identity-only switching. ' +
    'With --check it writes nothing and reports source drift. --icons-specifier keeps ' +
    'its existing generated-module behavior. It prints one line per built theme and ' +
    'one line naming fonts the themes do not load; --detail full adds the install ' +
    'example and the font recipe, once for a batch.',
  fn: 'themeBuild',
  args: [{name: 'files', param: 'file', required: true, variadic: true}],
  options: [
    {
      flag: '--family',
      description:
        'Build the selected extension family into one keyed CSS, JS, and declaration set, written beside the family root theme file, which must be inside the working directory to build (ERR_PATH_TRAVERSAL); --check only reads, so it compares outputs anywhere. Requires --family-key; refused with --out or --watch (ERR_THEME_INVALID)',
    },
    {
      flag: '--family-key <key>',
      description:
        'Lower-kebab filename stem required with --family and refused without it; must differ from every member name (ERR_THEME_INVALID)',
    },
    {
      flag: '-o, --out <path>',
      param: 'options.out',
      description:
        'Output CSS file path, relative or absolute; the .js and .d.ts are written beside it (default: <theme name>.css next to the source). A build writes only inside the working directory, the defaults beside the source too (ERR_PATH_TRAVERSAL); --check writes nothing, so it compares outputs anywhere and refuses only a relative path that escapes the working directory. Single theme only: refused with more than one file or with --family (ERR_THEME_INVALID)',
    },
    {
      flag: '--icons-specifier <specifier>',
      param: 'options.iconsSpecifier',
      description:
        "Override the icon-registry import in the generated JS module, for example ./icons.mjs (default: the specifier in the theme source's own import). With --family it applies to every member's icon import",
    },
    {
      flag: '-w, --watch',
      description:
        'Rebuild automatically when a theme file changes (Ctrl-C to stop). Refused with --check, --family, or --json (ERR_THEME_INVALID)',
    },
    {
      flag: '-c, --check',
      param: 'options.check',
      description:
        'Verify the committed outputs match the source without writing; exit non-zero if stale. Composes with --family and several files; refused with --watch (ERR_THEME_INVALID)',
    },
  ],
  examples: [
    {
      label: 'Build to a CSS file',
      cli: 'astryx theme build ./src/themes/ocean.ts --out ./dist/ocean.css',
    },
    {
      label: 'Build one related family for attribute-only switching',
      cli: 'astryx theme build --family ./themes/ocean.mjs ./themes/ocean-calm.mjs --family-key ocean-family',
    },
    {
      label: 'Build every theme in a directory',
      cli: 'astryx theme build ./src/themes/*.ts',
    },
    {
      label: 'Check for drift (CI)',
      cli: 'astryx theme build ./src/themes/ocean.ts --check',
    },
    {
      label: 'Build against a separately compiled icon registry',
      cli: 'astryx theme build ./src/themes/ocean.ts --icons-specifier ./icons.mjs',
    },
  ],
  outsideProject: 'same',
  exitCodes: [
    {
      code: 0,
      when: 'the theme builds, or --check finds the outputs up to date',
    },
    {
      code: 1,
      when: 'a build or validation error, or --check finds stale or missing outputs',
    },
  ],
  related: ['theme add', 'theme list'],
};
