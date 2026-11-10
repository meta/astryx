// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme reset`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme reset',
  displayName: 'astryx experimental theme reset',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: "Return one setting to the base theme's value, rebuild, preview",
  description:
    "Returns one setting to the base theme's value: the setting is removed, and the theme is rebuilt and previewed. Name it the way it was set: the same thing and the same --on, --when, --state, --mode and --only (`show` lists every setting that way). For the headings dial, name which half to reset: weight or tracking (default weight). A setting the theme does not have is refused and the error lists the settings it has for that thing. Experimental: it may change or be removed in a patch release.",
  fn: 'themeEditReset',
  args: [
    {
      name: 'theme',
      param: 'theme',
      required: true,
    },
    {
      name: 'thing',
      param: 'thing',
      required: true,
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
        'Where it applies (default: the whole theme): a part (button, card, app-shell-header; explain --list parts), a family (inputs, containers, checks, menus; explain --list families), or for font a role (body, heading, code)',
    },
    {
      flag: '--when <prop:value>',
      param: 'options.when',
      description:
        'Only that variant of the part, such as variant:primary or status:error (explain <part> lists them); needs --on',
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
        'light or dark: only that color mode. Colors and shadows only; sizes, numbers and fonts are the same in both modes, and a light-only or dark-only theme takes no --mode',
    },
    {
      flag: '--only',
      param: 'options.only',
      description:
        'With one member of an always-alike family (inputs, checks), style just that part instead of the whole family',
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
      label: 'Reset a whole-theme dial',
      cli: 'astryx experimental theme reset brand corners',
    },
    {
      label: 'Reset a part setting',
      cli: 'astryx experimental theme reset brand background --on app-shell-header',
    },
    {
      label: 'Reset the headings letter spacing',
      cli: 'astryx experimental theme reset brand headings tracking',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme reset writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: "the setting is back to the base theme's value, and the theme is rebuilt and previewed",
    },
    {
      code: 1,
      when: 'the theme does not have that setting, the theme does not exist, or a build failure; nothing is written',
    },
  ],
  related: ['experimental theme', 'experimental theme compile'],
};
