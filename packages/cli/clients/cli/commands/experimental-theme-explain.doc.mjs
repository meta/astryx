// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme explain`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme explain',
  displayName: 'astryx experimental theme explain',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    "Explain a part, family, setting or aspect; answer a question in plain words; read a picture's colors; or list what you can set",
  description:
    'One command for every question. A part (button, card; --list parts): what it reads for each aspect (text, background, border, corners, shadow, spacing, font, size) and under which variant or state, its variants (--when) and states (--state), the parts inside it (a token set --on the part reaches them), and its family. A family (inputs, containers, checks, menus): its members and whether styling one styles all. A setting: a dial\'s rungs and examples, a token\'s type, default and the parts that read it, or a CSS property and the parts that set it. An aspect (colors, text, background, border, corners, shadow, spacing, font, size): the dial and the whole-theme tokens most parts read for it. A question in plain words ("bold white text in the header", "glossy gradient header"): it finds the parts (header, nav links, banner, cards, inputs, buttons and their variants...) and aspects (text color, background, gradient, corners, border, shadow or bevel, spacing, font, bold, letter spacing) and answers with exact commands from what each part really reads: the direct property (always works) and the token route; a part with variants says a change without --when reaches every variant. A PNG picture: its main colors, biggest share first, with where each sits (a number after the file sets how many, default 14), or with --at the exact color at pixel points (no browser needed). --list dials|tokens|parts|families|properties lists what a change can name; a subject then filters the list. Experimental: it may change or be removed in a patch release.',
  fn: 'themeEditExplain',
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
      flag: '--list <kind>',
      param: 'options.list',
      description:
        'List what a change can name: dials, tokens (with type, default and how many parts read each), parts (with component, family, variants and states), families, or properties (the common CSS properties; a filter searches every standard one). The subject, if any, filters the list',
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
      cli: 'astryx experimental theme explain banner',
    },
    {
      label: 'A question',
      cli: 'astryx experimental theme explain "bold white text in the header"',
    },
    {
      label: 'A setting',
      cli: 'astryx experimental theme explain --color-accent',
    },
    {
      label: 'Colors in a picture',
      cli: 'astryx experimental theme explain target.png --at "40,20;300,180"',
    },
    {
      label: 'Every dial',
      cli: 'astryx experimental theme explain --list dials',
    },
    {
      label: 'Accent tokens',
      cli: 'astryx experimental theme explain accent --list tokens',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme explain writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the answer (an empty answer or list included)',
    },
    {
      code: 1,
      when: 'nothing named, an unknown --list kind, --at without a picture, a missing or unreadable PNG file, or an odd count of numbers in --at',
    },
  ],
  related: ['experimental theme', 'experimental theme compile'],
  replaces: ['theme targets'],
};
