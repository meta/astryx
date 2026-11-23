// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme editor show`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme editor show',
  displayName: 'astryx experimental theme editor show',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    "Every setting, key values, problems the theme caused, and the theme-building page with every component; with --on, one part's resolved values for any theme",
  description:
    "With `--on` set to a part, a lookup that writes nothing: what one part of any theme the project builds shows, each property's final value with its tokens and who sets it. An editor theme is read from its saved settings: what its theme file adds by hand below them is not shown yet. Without it, lists every setting with where it applies and its source (dial, token or property), the resolved value of key tokens in each mode, the colors (the vibrancy; each color with its seed and the shade each token uses in light and dark, marked when an exact token setting wins; any shade moved so text reads), contrast problems this theme caused versus its base, font notes, and last the generated color files. Writes two self-contained HTML files: preview.html (the sample app page) and sheet.html (the theme-building page: every component grouped, each variant side by side, overlays open, and real template pages, with an auto/light/dark switch); a file of yours at a page's name (one without the editor's stamp, a link, a folder) is left alone, and the result names it. A theme with no build is built first, and an in-app preview (`preview add`) of the theme has its route and Colors page rewritten. --section limits the sheet to one section. An own change to <theme>.theme.ts since the last build is built first, and the colors mark where it wins over a generated shade; a theme source that no longer builds, or a token in it that is not text, is refused (ERR_THEME_INVALID, exit 1) and the folder stays as it was. Experimental: it may change or be removed in a patch release. The result ends with `wiring`: `astryx theme add <theme>` for the app copy of the theme (src/themes/<theme>/, a standard local theme every build writes), the `mode` of a one-mode theme for the `<Theme>`, and what builds it; only when a folder of yours holds src/themes/<theme>/ does it give the imports in the root file and the `<Theme>` by hand. When show builds the theme again (its build does not match the settings, say after a hand edit), the pictures --png took of the theme as it was are removed, and the result names them.",
  fn: 'themeEditShow',
  args: [
    {
      name: 'theme',
      param: 'theme',
      required: true,
    },
  ],
  options: [
    {
      flag: '--on <part>',
      param: 'options.on',
      description:
        "Only what one part shows, as a lookup that writes nothing: each CSS property the part reads, at rest and in each variant, with its final value (per mode when the modes differ), the declaration that gives it, the tokens it reads, and who decides it (`source`: core, the base theme it extends, or the theme's own file; which setting gives it is not shown yet). The theme may be any theme the project builds: an editor theme, a local theme or an installed theme package (a slug two packages provide is the one the app records). The text lists the part at rest and the first four variant values that differ from it, with how many there are; --json carries every value. An editor theme is read from its saved settings: what its theme file adds by hand below them is not shown yet.",
    },
    {
      flag: '--section <name>',
      param: 'options.section',
      description:
        'Only one section of the sheet: actions, inputs, selection, navigation, feedback, data, containers, overlays, or pages',
    },
    {
      flag: '--png',
      param: 'options.png',
      description:
        "Also take PNG pictures of the previews (light and dark): preview.png, the sample page, and sheet-overlays.png, each control at rest, hovered, focused and pressed at its top, then every menu, tooltip, popover and list drawn open (from sheet-overlays.html, which it writes too; a file of yours by that name is left alone and the picture not taken) (show adds a picture of each family of components the theme sets a part of with --on, or of the buttons when it sets none: sheet-<family>.png, from the sheet-<family>.html it writes beside the full sheet; the families are actions, inputs, selection, navigation, feedback, data and containers, and a family taller than 1600px is cut between rows of parts into pictures of about that height (a row taller than that is a picture of its own), in order (sheet-<family>-1.png, -2 …), so each reads whole. With --section, that section's picture is taken in their place (the pages section, the sample app and each page template, is cut between pages the same way: sheet-pages-1.png, -2 …), so --section <family> --png pictures any other family. sheet.html, every component, is written but not pictured; the open states are taken with a section too), with no dev server running: it needs a Playwright installed in the project or a Chrome or Chromium found on the machine, and adds a few seconds while the browser starts (a browser that takes longer than 60 seconds, plus 20 seconds for each picture after the first, is stopped, and the result says so); without one, the result says how to get it. Each picture carries the editor stamp and is recorded, by name and content, in themes/<theme>/<theme>.pictures.json; a file of yours named like a picture (preview.png, sheet-overlays.png) is never written over: no picture is taken, and the result names the file. Taking pictures changes nothing in the app, except that show first brings the app copy (src/themes/<theme>/) and an in-app preview up to date after a hand edit to <theme>.theme.ts",
    },
  ],
  examples: [
    {
      label: 'Everything',
      cli: 'astryx experimental theme editor show brand',
    },
    {
      label: 'With pictures',
      cli: 'astryx experimental theme editor show brand --png',
    },
    {
      label: "One part's resolved values, for any theme",
      cli: 'astryx experimental theme editor show neutral --on card',
    },
  ],
  outsideProject: 'refuse',
  requires: ['themes.compile'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme editor show writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: "the settings are listed and both pages are written, or, with --on, the part's values are listed",
    },
    {
      code: 1,
      when: 'the theme does not exist or its base theme package is not installed (ERR_UNKNOWN_THEME), an unknown --section, an --on that names no part or a group, --on given two different parts, or --on with --png or --section (ERR_INVALID_ARGUMENT), with --on, a theme slug two packages provide that the app records none of (ERR_AMBIGUOUS_THEME; the suggestions add one to the app), a theme source that does not build or parse or a token in it that is not text (ERR_THEME_INVALID), a folder where a built file goes (ERR_FILE_EXISTS), a built file that cannot be read or written (ERR_WRITE_FAILED), another command changing the theme (ERR_THEME_BUSY), a page that does not render (ERR_RENDER_FAILED), or a folder outside a project with Core installed (ERR_PROJECT_REQUIRED)',
    },
  ],
  related: ['experimental theme editor', 'experimental theme compile'],
};
