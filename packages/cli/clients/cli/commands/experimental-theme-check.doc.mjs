// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme check`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme check',
  displayName: 'astryx experimental theme check',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Build a theme and list what a person would see as broken in light and dark; --fix repairs it',
  description:
    "Compiles the theme as `experimental theme compile` does and lists what a person would see as broken in light and dark. It checks text that does not read on the components (on the page, surfaces, cards, menus, the accent and status fills, and on fills the theme sets on a part); see-through menus; menus and dialogs with the page's fill and no shadow (from the shadow tokens or a menu's own style) and no border; checkbox, switch and field edges under 95% of Core's own edge contrast on the same ground (3:1 always passes); a surface on the other side of light and dark from the page; a part that sets a text token for itself, so the menus and fields inside it draw that text on their own fill; one look for both modes that the app's <Theme> does not pin; an app page its CSS does not paint; a part that looks the same under the pointer as at rest where Core's own changes; and a font family nothing loads with no generic family after it. --fix fills every color the theme leaves unset from the colors it sets (the palette generator grows them from its surface or page, accent and status colors), moves only the lightness of text that does not read, just far enough (its hue stays), gives flat menus Core's overlay shadow, adds Core's generic family (from the same token's own stack) after a font nothing loads, pins the app's mode for a one-look theme and paints the app's page; then it checks again. Of the colors the theme sets, it changes only its own text and icon colors, and each such move names the old value and the `accepted` record that would keep it instead. A sibling `<theme>.accepted.json` holding only an `accepted` list keeps contrast as designed: a pair a record covers, in a color the author set, is left alone and counted in `accepted`, never a problem. For a bar that sets a text token for itself, fix keeps the bar's line and sets the theme's own text token again on each group of parts inside it that paint their own fill (menus, inputs), one entry per group: one shared const at the top of the file holds the text, and each member's base spreads it, so it is one line to change. Its theme values are normal lines in the theme file. For a one-look theme it adds mode to the app's <Theme> elements that wear the theme, and for an unpainted page it adds the page rule to the stylesheet that loads Core's (or writes astryx-page.css beside the script that does, and imports it). A protected app file (generated, ignored, a dependency) is left alone and listed in `protectedFiles` with `code` ERR_CODEMOD_PROTECTED. When Core's components cannot be drawn, the result leads with a warning that text was not measured (`unmeasured`). A protected theme file is refused before anything is written. A theme the editor made is refused: `editor show` lists its problems. Experimental: it may change or be removed in a patch release.",
  fn: 'themeEditCheck',
  args: [
    {
      name: 'theme',
      param: 'theme',
      required: true,
    },
  ],
  options: [
    {
      flag: '--fix',
      param: 'options.fix',
      description:
        "Write the repair: normal lines in the theme file, and for a one-look theme or an unpainted page, the app's <Theme> mode or its page rule; then check again",
    },
  ],
  examples: [
    {
      label: 'Check a theme of the app',
      cli: 'astryx experimental theme check brand',
    },
    {
      label: 'Check a theme file and repair it',
      cli: 'astryx experimental theme check ./src/themes/brand/brandTheme.ts --fix',
    },
  ],
  outsideProject: 'refuse',
  requires: ['themes.compile'],
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme check writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'nothing a person would see as broken was found (after the repair, with --fix), text was measured, and no protected file kept a repair back',
    },
    {
      code: 1,
      when: 'problems remain (the result lists them), text on the components was not measured (`unmeasured`), a protected app file kept a repair back (`protectedFiles`, code ERR_CODEMOD_PROTECTED), no theme by that name or file (ERR_UNKNOWN_THEME), no theme named (ERR_MISSING_ARGUMENT), a theme the editor made (ERR_INVALID_ARGUMENT), a theme that does not build or a file the repair cannot be written into (ERR_THEME_INVALID), a theme that does not load (ERR_THEME_LOAD), a file of yours where a build output goes (ERR_FILE_EXISTS), a theme outside the project (ERR_PATH_TRAVERSAL), a protected theme file with --fix (ERR_CODEMOD_PROTECTED) or a protection file that cannot be read (ERR_CODEMOD_PROTECTION_SOURCE), or a folder outside a project with Core installed (ERR_PROJECT_REQUIRED)',
    },
  ],
  related: ['experimental theme compile', 'experimental theme editor show'],
};
