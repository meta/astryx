// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme editor new`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme editor new',
  displayName: 'astryx experimental theme editor new',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary: 'Start a theme in themes/<theme>/, optionally on a built-in theme',
  description:
    'Makes themes/<theme>/ with <theme>.settings.json (the settings this command owns), the generated <theme>.settings.ts, <theme>.theme.ts (which extends it and is yours), and the built <theme>.css and <theme>.js (the same build as `astryx theme build`), then writes preview.html, the sample app page with the theme. --like builds on a built-in theme (neutral, stone, matcha, y2k, gothic, chocolate, butter; its package must be installed); without it the theme starts from Astryx defaults. Any `set` dial can be a flag too (--accent "#7c3aed" --font inter --corners round --vibrancy 60 ...): the same names, values and checks as `set`, all applied in the one build, with one result that lists them. Change the base later with `astryx experimental theme editor set <theme> base <theme|none>`. Afterwards, <theme>.theme.ts is yours: it extends the generated <theme>.settings.ts, and every later change rewrites only the settings files, so your own edits in <theme>.theme.ts survive. A theme name is lowercase letters, digits and dashes. Experimental: it may change or be removed in a patch release.',
  fn: 'themeEditNew',
  args: [
    {
      name: 'theme',
      param: 'theme',
      required: true,
    },
  ],
  options: [
    {
      flag: '--like <theme>',
      param: 'options.like',
      description:
        'A built-in theme to build on: neutral, stone, matcha, y2k, gothic, chocolate, or butter',
    },
    {
      flag: '--png',
      param: 'options.png',
      description:
        'Also take PNG pictures of the previews (light and dark), with a Playwright installed in the project or a Chrome or Chromium found on the machine; without one, the result says how to get it. Nothing else changes',
    },
    {
      flag: '--corners <rung>',
      param: 'options.settings',
      description:
        'How round corners are: square, small, medium, large, round, pill, or a size like 6px. The same value and check as `set <theme> corners`',
    },
    {
      flag: '--spacing <rung>',
      param: 'options.settings',
      description:
        'How much room: tight, compact, medium, roomy or spacious. The same value and check as `set <theme> spacing`',
    },
    {
      flag: '--accent <color>',
      param: 'options.settings',
      description:
        'The brand color; its light and dark shades are generated from it. The same value and check as `set <theme> accent`',
    },
    {
      flag: '--neutral <color>',
      param: 'options.settings',
      description:
        'The gray of surfaces, text and borders; its shades are generated from it. The same value and check as `set <theme> neutral`',
    },
    {
      flag: '--success <color>',
      param: 'options.settings',
      description:
        'The success color. The same value and check as `set <theme> success`',
    },
    {
      flag: '--warning <color>',
      param: 'options.settings',
      description:
        'The warning color. The same value and check as `set <theme> warning`',
    },
    {
      flag: '--danger <color>',
      param: 'options.settings',
      description:
        'The danger (error) color. The same value and check as `set <theme> danger`',
    },
    {
      flag: '--info <color>',
      param: 'options.settings',
      description:
        'The info color. The same value and check as `set <theme> info`',
    },
    {
      flag: '--vibrancy <0-100>',
      param: 'options.settings',
      description:
        'How saturated the generated colors are (50 is the default); needs a color. The same value and check as `set <theme> vibrancy`',
    },
    {
      flag: '--font <font>',
      param: 'options.settings',
      description:
        'The typeface: a preset, an open font, a family name or a stack. The same value and check as `set <theme> font`',
    },
    {
      flag: '--headings <style>',
      param: 'options.settings',
      description:
        'Heading weight (light to heavy) or tracking (tight, tighter, normal, wide). The same value and check as `set <theme> headings`',
    },
    {
      flag: '--surfaces <style>',
      param: 'options.settings',
      description:
        'flat, outlined, raised or glass. The same value and check as `set <theme> surfaces`',
    },
    {
      flag: '--buttons <style>',
      param: 'options.settings',
      description:
        'solid, outline, soft or caps. The same value and check as `set <theme> buttons`',
    },
    {
      flag: '--type <style>',
      param: 'options.settings',
      description:
        'compact, standard, editorial or display. The same value and check as `set <theme> type`',
    },
    {
      flag: '--text-size <size>',
      param: 'options.settings',
      description:
        'small, medium, large, larger, or a number. The same value and check as `set <theme> text-size`',
    },
    {
      flag: '--mode <modes>',
      param: 'options.settings',
      description:
        'both, light-only or dark-only. The same value and check as `set <theme> mode`',
    },
  ],
  examples: [
    {
      label: 'Start on a built-in theme',
      cli: 'astryx experimental theme editor new brand --like neutral',
    },
    {
      label: 'Start from Astryx defaults',
      cli: 'astryx experimental theme editor new brand',
    },
    {
      label: 'Start with settings, in one build',
      cli: 'astryx experimental theme editor new brand --like neutral --accent "#7c3aed" --font inter --corners round --vibrancy 60',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme editor new writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the theme is made and built, and its preview is written; or made but not checked, when the components could not be rendered: the output starts with [warn] saved, not checked (ERR_THEME_NOT_CHECKED) and the cause',
    },
    {
      code: 1,
      when: 'a name that is not lowercase letters, digits and dashes, a theme that already exists, a --like that is not a built-in theme or is not installed, a setting flag that `set` would refuse, no Core installed in the folder, or a build failure (nothing is left behind)',
    },
  ],
  related: ['experimental theme editor', 'experimental theme compile'],
};
