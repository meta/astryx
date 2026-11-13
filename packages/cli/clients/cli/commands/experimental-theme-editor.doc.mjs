// Copyright (c) Meta Platforms, Inc. and affiliates.

/**
 * @file CommandDoc for the `astryx experimental theme editor` group: make and
 * change a theme one checked change at a time.
 */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme editor',
  displayName: 'astryx experimental theme editor',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Make and change a theme one checked change at a time (dials, tokens, part styles), with previews',
  description:
    "A type-safe compiler for themes. A theme lives in themes/<theme>/: <theme>.settings.json holds the checked settings and is owned by this command; <theme>.settings.ts is generated from it on every change; <theme>.theme.ts extends it, is written once and is yours to edit; <theme>.css and <theme>.js are built from it; build them again with `astryx experimental theme compile themes/<theme>/<theme>.theme.ts`, which checks the editor's settings first. Every change is CHECKED against what the installed Core's components really read (derived from Core itself, version for version, and cached under node_modules/.cache/) and against the token's type; a change that cannot take effect is refused, nothing is written, and the error leads with the command that works. The thing you set is a dial (a big move with named rungs: corners, spacing, font, headings, text-size, base, mode; or a color: accent, neutral, success, warning, danger, info, each generating its light and dark shades from one color for the color tokens, and vibrancy, how saturated they are), a design token by name, or a CSS property on a part. Where it applies: --on <part|group>, --when <prop>:<value>, --state <state>, --mode light|dark, --only. Every accepted change rebuilds and writes preview.html (the sample app page); `show` adds the theme-building page with every component. PNG pictures only with --png. Commands on one theme run one after the other, through a lock in node_modules/.cache/astryx-theme/ of the project; when node_modules cannot be written (a read-only install), changes are refused and `show` still reads the last build. `how` answers everything else: what a part, group, setting or aspect does, how the colors are made, plain-words questions (with exact commands), a picture's colors, and lists of what you can set. Experimental: it may change or be removed in a patch release.",
  subcommands: ['new', 'set', 'undo', 'show', 'how'],
  examples: [
    {
      label: 'Start a theme',
      cli: 'astryx experimental theme editor new brand --like neutral',
    },
    {
      label: 'Round everything',
      cli: 'astryx experimental theme editor set brand corners pill',
    },
    {
      label: 'Ask how',
      cli: 'astryx experimental theme editor how "white text in the banner"',
    },
    {
      label: 'See it all',
      cli: 'astryx experimental theme editor show brand',
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
  related: ['experimental theme', 'theme build'],
};
