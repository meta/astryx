// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditCreate()` / `astryx experimental theme create <name> --traits`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditCreate',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditCreate()',
  summary: 'Write a new theme from a few typed traits.',
  description:
    "Writes a new theme from a few typed traits: look, page, surface, text, accent, bar, font, corners, density, borders, shadows, surfaces, and exact tokens and components, which win over the rest. It writes src/themes/<name>/<camelName>Theme.ts (`my-brand` writes myBrandTheme.ts): one defineTheme() file with the colors the traits give, Core's corner, spacing, size, type, border and shadow values (each font with the fallbacks of its kind, and a note on the package that loads it), and the part styles the traits ask for; the surfaces trait is one shared style that the containers and menus name. The top bar paints its own fill and gives what is drawn straight on it the bar's text, a quieter text that still reads for items at rest, and its own pointer and press tints. A one-look theme exports `colorModes`, so the app shows it in that mode. Then it builds the file with the theme build, adds it to the app and makes it the default (as `theme add` and `theme use` do), and runs `experimental theme check <name> --fix` on it, which fills every other color in light and dark from the colors the file sets; `check` in the result is that run's data. The file is the person's: edit any line, then run `astryx experimental theme check <name>`. Once written, the file is never written again: a second run with the name stops with ERR_FILE_EXISTS and writes nothing (edit the file and check it, or pick another name). An unknown trait field is refused with the list of fields (ERR_INVALID_ARGUMENT), and nothing is written. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api/experimental',
  signature:
    'themeEditCreate(name: string, traits: string | object, options?: {cwd?: string}): Promise<object>',
  keywords: ['theme', 'experimental theme', 'create', 'traits', 'new theme'],
  params: [
    {
      name: 'name',
      type: 'string',
      description:
        "The new theme's name: lowercase letters, digits and dashes, starting with a letter; not a bundled theme's name.",
      required: true,
    },
    {
      name: 'traits',
      type: 'string | object',
      description:
        'The traits, as JSON text, a path to a .json file, or the object itself.',
      required: true,
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'The folder to start from (default: the current directory): the command acts on the Astryx app at or above it.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.create',
      description:
        'The file written, the look, how many colors and other values it holds, the parts it styles, the stylesheet built, the app module, the check result and notes.',
    },
  ],
  throws: [
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: "the traits are not valid JSON, name a field the traits do not take, give a field a value it does not take, or name a token or part this Core does not have; or the name is not a theme name, or is a bundled theme's",
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'a theme file is at the path already, or the theme editor has a theme with that name',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: "the theme's folder leads out of the app (a link)",
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: 'no app with @astryxdesign/core installed at the folder or above it',
    },
  ],
  examples: [
    {
      label: 'A warm light and dark theme',
      code: "await themeEditCreate('acme', {page: '#f7f5f0', accent: '#c2410c', corners: 4});",
    },
  ],
  command: 'experimental theme create',
  related: ['themeEditCheck', 'themeBuild', 'themeAdd', 'themeUse'],
};
