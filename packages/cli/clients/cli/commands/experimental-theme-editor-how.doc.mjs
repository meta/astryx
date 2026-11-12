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
    'One command for every question. With nothing named, it prints its usage and examples. A part (button, card; --list parts): what it reads for each aspect (text, background, border, corners, shadow, spacing, font, size), each condition written as the --when and --state flags `set` takes or marked not settable with the reason, its variants, every state `set` accepts, the parts inside it (a token set --on the part reaches them), and its group; a part the part data does not have says so, with commands that still apply. A group (inputs, containers, checks, menus): its members and whether styling one styles all. A setting: a dial\'s rungs and examples, a token\'s type, default and the parts that read it (and, when none does, whether Core\'s stylesheet still uses it), or a CSS property and the parts that set it. An aspect (text, background, border, corners, shadow, spacing, font, size): the dial and the whole-theme tokens most parts read for it. `colors` (or `palette`): how the theme\'s colors are made: one seed per color, light and dark shades generated with the same generator as `theme palette generate`, the shade each token starts from, vibrancy, the Colors preview page and the exact-token escape hatch. A lookup takes any case, a plural, and a token name without its dashes. A question in plain words ("bold white text in the header", "remove shadows from cards", "cards: 8px radius; buttons: 4px"): it reads each clause for the parts (and their variant, size, state or mode), what to change, the values typed (hex, rgb(), lengths, dashed), and whether it asks for more, less or none ("shouldn\'t", "turn off", "never", "too sharp", "everything except X" included), and answers with exact commands; a typed value always wins over a color word, and a hex color with the wrong number of digits is refused by name, never replaced with a sample. "In dark mode" carries --mode dark to every color command; a change that cannot differ by mode, or a dark-mode ask on a light-only theme, says so instead. A question about what something is ("what does --color-accent do") gets the lookup. Several changes in one question come first as one sequence (`sequence: true`: run every command in order, at most 12), with repeated and overwritten steps left out; two asks that contradict each other are offered as choices. Changes come before lookups. Every suggested command names the theme (`theme`: the one named with `theme`, the only one, or the one an editor command changed last, said in `themeNote`; `themeChosenBy` says which: named, only, last-changed or none; with none, my-theme, made first), holds a real value, never a placeholder or a comment, and is checked as `set` checks it: a command `set` would refuse, or that changes nothing, is left out and listed in `refused` with the reason. A question with no answer says why in `hint`, with the next commands in `run`. A PNG picture (by any file name; other formats are refused by their bytes): its main colors from every pixel (on an even grid past 4 million), biggest share first, with where each sits, see-through pixels skipped, tRNS included (a number after the file sets how many, default 14), or with --at the exact color and alpha at pixel points; a picture over 40 million pixels (20 million at 16 bits), or with pixel data that is damaged or shorter than its header says, is refused before it is decoded. --list <what> lists what a change can name (dials, tokens, parts, groups or properties, in any case, singular or plural; kinds or no word lists those kinds), and the other words filter the list. Experimental: it may change or be removed in a patch release.',
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
      flag: '--list',
      param: 'options.list',
      description:
        'List what a change can name; the word that names a kind says what, wherever it is (any case, singular or plural): dials, tokens (with type, default and how many parts read each), parts (one item per name, with its components, group, variants and states), groups, or properties (the common CSS properties; a filter searches every standard one). The other words filter the list, and may start with --. --list=tokens works too. With no word, or kinds, the kinds it lists',
    },
    {
      flag: '--theme <name>',
      param: 'options.theme',
      description:
        'The theme the suggested commands are for, checked against its settings (default: the only theme the editor made in the app; with several, the one an editor command changed last; with none, a theme named my-theme that the answer makes first). An empty name or --theme given twice is refused, for every subject',
    },
    {
      flag: '--at <points...>',
      param: 'options.at',
      description:
        'With a PNG picture: the exact color and alpha at pixel points x,y (whole numbers inside the picture), given as "40,20;300,180", "40,20 300,180", a repeated --at, or a flat "40,20,300,180"',
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
      label: 'A question, with commands for one theme',
      cli: 'astryx experimental theme editor how "remove shadows from cards" --theme brand',
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
      when: 'an unknown option, an unknown or empty theme, --theme given twice, an unknown --list kind, --list given twice, --at without a picture, a picture that is not a PNG or is damaged or too big, an --at point that is not whole pixel numbers or falls outside the picture, a count beside --at, or a count that is not a positive whole number, or a missing picture; or a folder outside a project with Core installed (ERR_PROJECT_REQUIRED)',
    },
  ],
  related: ['experimental theme editor', 'experimental theme targets'],
};
