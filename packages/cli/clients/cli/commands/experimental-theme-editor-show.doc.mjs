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
    'Every setting, key values, problems the theme caused, and the theme-building page with every component',
  description:
    'Lists every setting with where it applies and its source (dial, token or property), the resolved value of key tokens in each mode, the colors (the vibrancy; each color with its seed and the shade each token uses in light and dark, marked when an exact token setting wins; any shade moved so text reads), contrast problems this theme caused versus its base, font notes, and last the generated color files. Writes two self-contained HTML files: preview.html (the sample app page) and sheet.html (the theme-building page: every component grouped, each variant side by side, overlays open, and real template pages, with an auto/light/dark switch). A theme with no build is built first, and an in-app preview (`preview add`) of the theme has its route and Colors page rewritten. --section limits the sheet to one section. An own change to <theme>.theme.ts since the last build is built first, and the colors mark where it wins over a generated shade; a theme source that no longer builds, or a token in it that is not text, is refused (ERR_THEME_INVALID, exit 1) and the folder stays as it was. Experimental: it may change or be removed in a patch release. The result ends with `wiring`: `astryx theme add <theme>` for the app copy of the theme (src/themes/<theme>/, a standard local theme every build writes), the `mode` of a one-mode theme for the `<Theme>`, and what builds it; only when a folder of yours holds src/themes/<theme>/ does it give the imports in the root file and the `<Theme>` by hand.',
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
      flag: '--section <name>',
      param: 'options.section',
      description:
        'Only one section of the sheet: actions, inputs, selection, navigation, feedback, data, containers, overlays, or pages',
    },
    {
      flag: '--png',
      param: 'options.png',
      description:
        'Also take PNG pictures of the previews (light and dark), with no dev server running: it needs a Playwright installed in the project or a Chrome or Chromium found on the machine, and adds a few seconds while the browser starts (a browser that takes longer than 60 seconds is stopped, and the result says so); without one, the result says how to get it. Each picture carries the editor stamp and is recorded, by name and content, in themes/<theme>/<theme>.pictures.json; a file of yours named like a picture (preview.png, sheet.png) is never written over: no picture is taken, and the result names the file. Taking pictures changes nothing in the app, except that show first brings the app copy (src/themes/<theme>/) and an in-app preview up to date after a hand edit to <theme>.theme.ts',
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
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme editor show writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the settings are listed and both pages are written',
    },
    {
      code: 1,
      when: 'the theme does not exist or its base theme package is not installed (ERR_UNKNOWN_THEME), an unknown --section (ERR_INVALID_ARGUMENT), a theme source that does not build or parse or a token in it that is not text (ERR_THEME_INVALID), a folder where a built file goes (ERR_FILE_EXISTS), a built file that cannot be read or written (ERR_WRITE_FAILED), another command changing the theme (ERR_THEME_BUSY), a page that does not render (ERR_RENDER_FAILED), or a folder outside a project with Core installed (ERR_PROJECT_REQUIRED)',
    },
  ],
  related: ['experimental theme editor', 'experimental theme compile'],
};
