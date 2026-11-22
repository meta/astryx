// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeAdd()` / `astryx theme add`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeAdd',
  namespace: 'cli/api',
  displayName: 'themeAdd()',
  summary: 'Add a built theme to the app.',
  description:
    "Records a package or built local theme and regenerates the app theme module with its built module and stylesheets. Given a shared theme instead of a slug (a path to its folder, a .tgz archive of it, or an https URL to a .tgz), it first copies the one theme folder in it into the local themes root (src/themes/<name>), installs the @astryxdesign packages the theme imports that the app lacks with the app's package manager, install scripts off (any other package it imports is named with its install command, never installed), and records the theme as the default; the receipt carries data.copy, with every file written and the record and dependencies changed. Nothing of the theme runs, so a theme shared without its built module is refused. A folder another theme holds, or a shared copy with files changed since (other than built files that hold exactly what the unchanged working files and the theme source the CLI wrote build now, which are replaced), is refused (the same shared theme over its own unchanged copy is replaced), as are an unreadable archive, a link or an outside path in it, and a source with no theme folder or more than one. When the source also carries the experimental theme editor's saved state for that theme (a folder holding <name>.settings.json), its data files (the settings and palette data, and for a palette a newer CLI made, its saved palette module when it is exactly the palette generator's form, carried byte for byte so the editor keeps those colors as made; data.copy.workingFiles.keptPalette names the recipe) are read as data and copied to themes/<name>/; theme add runs and copies no shared code (the experimental theme editor builds the theme's source when it opens the theme), and the app copy stays the editor's, with the shared theme's display name and description, so the editor's next builds update it (data.copy.workingFiles lists the files). It is not copied, and data.copy.workingFiles.notCopied says why, when the settings fail the editor's own checks, its palette recipe is one no Astryx CLI makes, a newer recipe's palette module is not in the generator's form, its <name>.theme.ts has edits of its own, the shared copy is not one the editor wrote, the source holds more than one such folder, or themes/<name>/ holds editor state theme add did not write (when that state is the theme's own, the same settings, the app copy still stays the editor's); a folder of only system files counts as empty. themeRemove takes back the unchanged editor files, or keeps and names them (data.undo.keptWorkingFiles) when the theme has been built there since, or when the copy stays whole because a file of it changed. options.import is an accepted compatibility no-op, as is options.overwrite set to false. Passing targetPath or options.overwrite set to true fails before writing and names themeEject, which owns source copying.",
  importPath: '@astryxdesign/cli/api',
  signature:
    'themeAdd(slug: string, options?: {targetPath?: string, overwrite?: boolean, import?: boolean, cwd?: string, package?: string}): Promise<ThemeAppResponse>',
  keywords: ['theme', 'add', 'import', 'app', 'default', 'local'],
  params: [
    {
      name: 'slug',
      type: 'string',
      description:
        'Slug of the available theme, or a shared theme: a path to its folder, a .tgz archive of it, or an https URL to a .tgz.',
      required: true,
    },
    {
      name: 'options.targetPath',
      type: 'string',
      description:
        'Removed copy destination. Passing it throws ERR_THEME_INVALID. Call themeEject instead.',
    },
    {
      name: 'options.overwrite',
      type: 'boolean',
      description:
        'False is a compatibility no-op. True throws ERR_THEME_INVALID. Call themeEject instead.',
      default: 'false',
    },
    {
      name: 'options.import',
      type: 'boolean',
      description:
        'Compatibility no-op; the built theme is added with or without this option.',
      default: 'false',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'Project directory used for discovery and app-theme state.',
      default: 'process.cwd()',
    },
    {
      name: 'options.package',
      type: 'string',
      description: 'Exact owner package used to disambiguate a shared slug.',
    },
  ],
  returns: [
    {
      type: 'theme.app',
      description:
        'The complete generated-module state and add change. Its envelope package names the npm package that owns the added theme, except for a local theme. data.notes, present only when needed, says which owner was chosen when a local theme shadows a package theme with the same slug, names a replaced recorded owner, and names added themes left out because their local folder or package is gone (a theme that is only broken or not installed yet still fails the command). data.appProvider, present on the first add when an installed package names the provider that wires its themes, gives each such provider as wiredBy ({export, from}, as theme list names it, with themeProp and modeProp when it takes the theme and its mode through those props) and wire, what the text prints: the app may already get its theme from it, with the props it takes. With exactly one provider, taking the theme, the wiring shown is that provider with the module theme passed (themeProp, and line, its opening JSX) in place of a Theme wrap; otherwise wire adds each provider trade-off above the Theme wiring. A later add that first lists themeModes carries it when that one provider takes the theme, saying how its wiring passes the mode. No receipt reads app source.',
    },
  ],
  throws: [
    {
      code: 'ERR_UNKNOWN_THEME',
      when: 'no available theme matches the slug and package',
    },
    {code: 'ERR_AMBIGUOUS_THEME', when: 'more than one package owns the slug'},
    {
      code: 'ERR_THEME_INVALID',
      when: 'the selected theme is invalid, targetPath is passed, or overwrite is true',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'the generated module path conflicts with an authored file',
    },
    {code: 'ERR_WRITE_FAILED', when: 'module generation fails'},
  ],
  examples: [
    {
      label: 'Add a built theme',
      code: "await themeAdd('butter');",
    },
    {
      label: 'Select a package theme over a local theme',
      code: "await themeAdd('ocean', {package: '@acme/themes'});",
    },
    {
      label: 'Keep the earlier opt-in spelling',
      code: "await themeAdd('butter', {import: true});",
    },
  ],
  command: 'theme add',
  related: ['themeRemove', 'themeUse', 'themeEject', 'themeListAvailable'],
};
