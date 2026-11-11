// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme editor undo`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme editor undo',
  displayName: 'astryx experimental theme editor undo',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Step back one change, or remove one setting; the result says what applies instead',
  description:
    "With only the theme, it steps back one change: the settings, the generated settings module and the build go back to how they were before the last change (your <theme>.theme.ts is not touched), and the preview is rewritten; the result names what was undone and how many earlier steps are left. When the settings file is damaged (not valid JSON), the step back restores the settings from before the last change without reading it. With a thing, it removes that one setting wherever it is in the settings, and the result says what applies now (`now`): the whole-theme setting for a part setting removed, or the base theme's value; the theme is rebuilt and previewed. Name the setting the way it was set: the same thing and the same --on, --when, --state, --mode and --only (`show` lists every setting that way). For the headings dial, name which half: weight or tracking (default weight). Removing a color (accent, neutral, success, warning, danger, info) stops generating it, and the tokens it fed go back to the base theme; with no color left, the generated color files the editor wrote are deleted; a palette.config.json you made, or one that holds a color of your own, stays. Removing vibrancy makes the colors again at the default, 50; removing the last color removes vibrancy too, as it needs a color. A setting the theme does not have is refused and the error lists the settings it has for that thing. `undo <theme> base` and `undo <theme> mode` go back to the base and mode the theme was made with; when they never changed, that is refused. The history keeps the last 80 steps (in <theme>.history.json); older steps are dropped. Experimental: it may change or be removed in a patch release.",
  fn: 'themeEditUndo',
  args: [
    {
      name: 'theme',
      param: 'theme',
      required: true,
    },
    {
      name: 'thing',
      param: 'options.thing',
      required: false,
    },
    {
      name: 'which',
      param: 'options.value',
      required: false,
    },
  ],
  options: [
    {
      flag: '--on <where>',
      param: 'options.on',
      description:
        'Where it applies (default: the whole theme): a part (button, card, app-shell-header; how --list parts), a group (inputs, containers, checks, menus; how --list groups), or for font a role (body, heading, code)',
    },
    {
      flag: '--when <prop:value>',
      param: 'options.when',
      description:
        'Only that variant of the part, such as variant:primary or status:error (how <part> lists them); needs --on',
    },
    {
      flag: '--state <state>',
      param: 'options.state',
      description:
        'Only that state of the part: hover, active, focus-visible, disabled, or a state the part lists (selected...); needs --on',
    },
    {
      flag: '--mode <mode>',
      param: 'options.mode',
      description:
        'light or dark: only that color mode. Colors only; sizes, numbers, fonts and shadows are the same in both modes, and a light-only or dark-only theme takes no --mode',
    },
    {
      flag: '--only',
      param: 'options.only',
      description:
        'With one member of an always-alike group (inputs, checks), style just that part instead of the whole group',
    },
    {
      flag: '--png',
      param: 'options.png',
      description:
        'Also take PNG pictures of the previews (light and dark), with a Playwright installed in the project or a Chrome or Chromium found on the machine; without one, the result says how to get it. Nothing else changes',
    },
  ],
  examples: [
    {
      label: 'Step back',
      cli: 'astryx experimental theme editor undo brand',
    },
    {
      label: 'Remove a whole-theme dial',
      cli: 'astryx experimental theme editor undo brand corners',
    },
    {
      label: 'Remove a part setting',
      cli: 'astryx experimental theme editor undo brand background --on app-shell-header',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme editor undo writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the last change is undone, or the setting is removed',
    },
    {
      code: 1,
      when: 'an unknown option, there is no earlier change, the theme does not set the thing, or the theme does not exist; or a folder outside a project with Core installed (ERR_PROJECT_REQUIRED)',
    },
  ],
  related: ['experimental theme editor', 'experimental theme editor show'],
};
