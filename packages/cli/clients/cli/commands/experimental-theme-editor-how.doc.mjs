// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme editor how`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme editor how',
  displayName: 'astryx experimental theme editor how',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    "Look up a part, group, setting or aspect; answer a question in plain words; read a picture's colors; or list what you can set",
  description:
    'One command for every question. With nothing named, it prints its usage and examples. A part (button, card; --list parts): what it reads for each aspect (text, background, border, corners, shadow, spacing, font, size) and under which variant or state, its variants (--when) and states (--state), the parts inside it (a token set --on the part reaches them), and its group. A group (inputs, containers, checks, menus): its members and whether styling one styles all. A setting: a dial\'s rungs and examples, a token\'s type, default and the parts that read it, or a CSS property and the parts that set it. An aspect (text, background, border, corners, shadow, spacing, font, size): the dial and the whole-theme tokens most parts read for it. `colors` (or `palette`): how the theme\'s colors are made: one seed per color, light and dark shades generated with the same generator as `theme palette generate`, the shade each token starts from, vibrancy, the Colors preview page and the exact-token escape hatch; a color (accent, neutral, success, warning, danger, info) also lists the shade each token starts from. Color questions in plain words ("brand color", "make it more colorful", "dark mode colors", "error red", "see all shades", "exact color for one token") get one line of what happens and the commands. A question in plain words ("bold white text in the header", "glossy gradient header"): it finds the parts (header, nav links, banner, cards, inputs, buttons and their variants...) and aspects (text color, background, gradient, corners, border, shadow or bevel, spacing, font, bold, letter spacing) and answers with exact commands from what each part really reads: the direct property (always works) and the token route; a part with variants says a change without --when reaches every variant. A PNG picture: its main colors, biggest share first, with where each sits (a number after the file sets how many, default 14), or with --at the exact color at pixel points (no browser needed). --list dials|tokens|parts|groups|properties lists what a change can name; a subject then filters the list. Experimental: it may change or be removed in a patch release.',
  fn: 'themeEditHow',
  args: [
    {
      name: 'subject',
      param: 'subject',
      required: false,
      variadic: true,
    },
  ],
  options: [
    {
      flag: '--list [kind]',
      param: 'options.list',
      description:
        'With no kind, the kinds it lists. List what a change can name: dials, tokens (with type, default and how many parts read each), parts (with component, group, variants and states), groups, or properties (the common CSS properties; a filter searches every standard one). The subject, if any, filters the list',
    },
    {
      flag: '--at <points...>',
      param: 'options.at',
      description:
        'With a PNG picture: the exact color at pixel points x,y, given as "40,20;300,180", "40,20 300,180", a repeated --at, or a flat "40,20,300,180"',
    },
  ],
  examples: [
    {
      label: 'A part',
      cli: 'astryx experimental theme editor how banner',
    },
    {
      label: 'A question',
      cli: 'astryx experimental theme editor how "bold white text in the header"',
    },
    {
      label: 'A setting',
      cli: 'astryx experimental theme editor how --color-accent',
    },
    {
      label: 'Colors in a picture',
      cli: 'astryx experimental theme editor how target.png --at "40,20;300,180"',
    },
    {
      label: 'How the colors are made',
      cli: 'astryx experimental theme editor how colors',
    },
    {
      label: 'A color question in plain words',
      cli: 'astryx experimental theme editor how "make it more colorful"',
    },
    {
      label: 'Every dial',
      cli: 'astryx experimental theme editor how --list dials',
    },
    {
      label: 'Accent tokens',
      cli: 'astryx experimental theme editor how accent --list tokens',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme editor how writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the usage (nothing named) or the answer (an empty answer or list included)',
    },
    {
      code: 1,
      when: 'an unknown option, an unknown --list kind, --at without a picture, a missing or unreadable PNG file, or an odd count of numbers in --at',
    },
  ],
  related: ['experimental theme editor', 'experimental theme targets'],
  replaces: ['theme targets'],
};
