// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for the `astryx experimental theme` group: make and change a
 * theme one checked change at a time.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme',
  displayName: 'astryx experimental theme',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Make and change a theme one checked change at a time (dials, tokens, part styles), with previews',
  description:
    "A type-safe compiler for themes. A theme lives in themes/<theme>/: <theme>.settings.json holds the checked settings and is owned by this command; <theme>.settings.ts is generated from it on every change; <theme>.theme.ts extends it, is written once and is yours to edit; <theme>.css and <theme>.js are built from it by the same build as `astryx theme build` (here also `compile`). Every change is CHECKED against what the installed Core's components really read (derived from Core itself, version for version, and cached under node_modules/.cache/) and against the token's type; a change that cannot take effect is refused, nothing is written, and the error leads with the command that works. The thing you set is a dial (a big move with named rungs: corners, spacing, accent, font, headings, text-size, base, mode), a design token by name, or a CSS property on a part. Where it applies: --on <part|family>, --when <prop>:<value>, --state <state>, --mode light|dark, --only. Every accepted change rebuilds and writes preview.html (the sample app page); `show` and `preview` add the theme-building page with every component. PNG pictures only with --png. `explain` answers everything else: what a part, family, setting or aspect does, plain-words questions (with exact commands), a picture's colors, and lists of what you can set. The same group carries experimental copies of every `astryx theme` command (compile, the copy of theme build; list, add, remove, use, eject, template, targets, palette), with the same functions and output. Experimental: it may change or be removed in a patch release.",
  subcommands: [
    'new',
    'set',
    'reset',
    'show',
    'undo',
    'preview',
    'explain',
    'compile',
    'list',
    'add',
    'remove',
    'use',
    'eject',
    'template',
    'targets',
    'palette',
  ],
  examples: [
    {
      label: 'Start a theme',
      cli: 'astryx experimental theme new brand --like neutral',
    },
    {
      label: 'Round everything',
      cli: 'astryx experimental theme set brand corners pill',
    },
    {
      label: 'Ask how',
      cli: 'astryx experimental theme explain "white text in the banner"',
    },
    {
      label: 'See it all',
      cli: 'astryx experimental theme show brand',
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'help is shown or a subcommand succeeds',
    },
    {
      code: 1,
      when: 'an unknown subcommand, a refused change, or a subcommand failure',
    },
  ],
  related: ['theme build', 'experimental render'],
};
