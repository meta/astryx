// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditCheck()` / `astryx experimental theme check`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditCheck',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditCheck()',
  summary:
    'Build a theme source and list what a person would see as broken in light and dark; with fix, repair it.',
  description:
    "Compiles the theme as `experimental theme compile` does and lists what a person would see as broken in light and dark. It lists, per mode, text that does not read on the components, see-through menus, menus that blend into the page, faint control edges, a surface on the other side of light and dark from the page, a part's text token inside its menus and fields, a one-look theme the app does not pin, and an app page nobody paints. With `fix` it fills the colors the theme leaves unset from the palette generator, moves only the lightness of unreadable text (its hue kept), gives flat menus Core's overlay shadow, pins the app's mode and paints its page, then checks again. Of the colors the theme sets, it changes only its own text and icon colors, and names the old value and the `accepted` record that would keep each one. Pairs a sibling `<theme>.accepted.json` keeps as designed, in colors the author set, are counted in `accepted` and left alone. For a bar's text token, fix sets the theme's own text again on each group of parts inside the bar (menus, inputs), one entry per group. Theme values are normal lines in the theme file; the mode goes on the app's <Theme> elements that wear the theme, and the page rule into the stylesheet that loads Core's (or a new astryx-page.css beside the script that does, imported there). A protected app file is left alone and listed in `protectedFiles` (with `code` ERR_CODEMOD_PROTECTED), and when Core's components cannot be drawn `unmeasured` says text was not measured; both count as problems left. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api/experimental',
  signature: 'themeEditCheck(theme: string, options?: object): Promise<object>',
  keywords: ['theme', 'experimental theme', 'check', 'contrast', 'fix'],
  params: [
    {
      name: 'theme',
      type: 'string',
      description:
        "A theme name in the app's src/themes/, or a theme source file.",
      required: true,
    },
    {
      name: 'options.fix',
      type: 'boolean',
      description:
        'Write the repair into the theme source (and pin or paint the app), then check again. Default false: the check writes nothing but the build.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'The folder to start from (default: the current directory): the check acts on the Astryx project at or above it, and a theme file is named from here.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.check',
      description:
        'The theme file, the modes checked, the problems left, each value fix wrote, the files it wrote, and notes.',
    },
  ],
  throws: [
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'no theme is named',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: 'no theme file and no theme by that name in src/themes/',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'a theme the editor made: the editor writes its source again (the suggestion is `editor show`)',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'the theme does not build, or the repair cannot be written into the file or does not build; the file stays as it was',
    },
    {
      code: 'ERR_THEME_LOAD',
      when: 'the theme source does not load',
    },
    {
      code: 'ERR_FILE_EXISTS',
      when: 'a file of yours sits where a build output goes',
    },
    {
      code: 'ERR_PATH_TRAVERSAL',
      when: 'the theme file is outside the project',
    },
    {
      code: 'ERR_CODEMOD_PROTECTED',
      when: 'with fix, the theme file is protected (generated, ignored, a dependency); nothing was written',
    },
    {
      code: 'ERR_CODEMOD_PROTECTION_SOURCE',
      when: 'with fix, a file that declares protection cannot be read; nothing was written',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: '@astryxdesign/core is not installed in the folder',
    },
  ],
  examples: [
    {
      label: 'Check and repair',
      code: "await themeEditCheck('brand', {fix: true})",
    },
  ],
  command: 'experimental theme check',
  related: ['themeBuild', 'themeEditShow'],
};
