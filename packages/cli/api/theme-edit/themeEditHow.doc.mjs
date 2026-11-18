// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditHow()` / `astryx experimental theme editor how`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditHow',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditHow()',
  summary:
    "Look up a part, group, setting or aspect; answer a question in plain words; read a picture's colors; or list what you can set.",
  description:
    'One command for every question. A part (button, card; --list parts): what it reads for each aspect (text, background, border, corners, shadow, spacing, font, size), each condition written as the --when and --state flags `set` takes or marked not settable with the reason, its variants, every state `set` accepts, the parts inside it (a token set --on the part reaches them), and its group; a part the part data does not have says so, with commands that still apply. A group (inputs, containers, checks, menus): its members and whether styling one styles all. A setting: a dial\'s rungs and examples, a token\'s type, default and the parts that read it (and, when none does, whether Core\'s stylesheet still uses it), or a CSS property and the parts that set it. An aspect (text, background, border, corners, shadow, spacing, font, size): the dial and the whole-theme tokens most parts read for it. `colors` (or `palette`): how the theme\'s colors are made: one seed per color, light and dark shades generated with the same generator as `theme palette generate`, the shade each token starts from, vibrancy, the Colors preview page and the exact-token escape hatch. A lookup takes any case, a plural, and a token name without its dashes. A question in plain words ("bold white text in the header", "remove shadows from cards", "cards: 8px radius; buttons: 4px"): it reads each clause for the parts (and their variant, size, state or mode), what to change, the values typed (hex, rgb(), lengths, dashed), and whether it asks for more, less or none ("shouldn\'t", "turn off", "never", "too sharp", "everything except X" included), and answers with exact commands; a typed value always wins over a color word, and a hex color with the wrong number of digits is refused by name, never replaced with a sample. "In dark mode" carries --mode dark to every color command; a change that cannot differ by mode, or a dark-mode ask on a light-only theme, says so instead. A question about what something is ("what does --color-accent do") gets the lookup. Several changes in one question come first as one sequence (`sequence: true`: run every command in order, at most 12), with repeated and overwritten steps left out; two asks that contradict each other are offered as choices. Changes come before lookups. Every suggested command names the theme (`theme`: the one named with `theme`, the only one, or the one an editor command changed last, said in `themeNote`; `themeChosenBy` says which: named, only, last-changed or none; with none, my-theme, made first), holds a real value, never a placeholder or a comment, and is checked as `set` checks it: a command `set` would refuse, or that changes nothing, is left out and listed in `refused` with the reason. A question with no answer says why in `hint`, with the next commands in `run`; the command\'s help (`astryx experimental theme editor how --help`) lists the kinds of ask it understands, with examples. A PNG picture (by any file name; other formats are refused by their bytes): its main colors from every pixel (on an even grid past 4 million), biggest share first, with where each sits, see-through pixels skipped, tRNS included (a number after the file sets how many, default 14), or with --at the exact color and alpha at pixel points; a picture over 40 million pixels (20 million at 16 bits), or with pixel data that is damaged or shorter than its header says, is refused before it is decoded. --list <what> lists what a change can name (dials, tokens, parts, groups or properties, in any case, singular or plural; kinds or no word lists those kinds), and the other words filter the list. Experimental: it may change or be removed in a patch release.',
  importPath: '@astryxdesign/cli/api/experimental',
  signature:
    'themeEditHow(subject?: string, options?: object): Promise<object>',
  keywords: [
    'theme',
    'experimental theme',
    'help',
    'design tokens',
    'type-checked',
  ],
  params: [
    {
      name: 'subject',
      type: 'string',
      description:
        'A part, group, setting, aspect, question, or PNG file; with `list`, a filter.',
    },
    {
      name: 'options.list',
      type: 'string',
      description:
        'dials, tokens, parts, groups, or properties; an empty string lists the kinds.',
    },
    {
      name: 'options.theme',
      type: 'string',
      description:
        'The theme the suggested commands are for (default: the only theme, the one an editor command changed last, or my-theme when there is none); an empty name is refused.',
    },
    {
      name: 'options.at',
      type: 'string[]',
      description: 'With a picture: pixel points x,y.',
    },
    {
      name: 'options.count',
      type: 'number',
      description: 'With a picture: how many main colors (default 14).',
    },
    {
      name: 'options.words',
      type: 'string[]',
      description:
        'The words as typed: a picture first takes only a count after it; anything else is one question. Replaces the subject.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description: 'The app folder.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.how',
      description:
        '`kind` says which answer it is: part (variants, states, reads per aspect with the flags for each condition, parts inside, group), group (members), setting, aspect or question (answers with checked commands for `theme`), picture (main colors, or the color and alpha at points), or list (the items).',
    },
  ],
  throws: [
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'nothing named',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'an empty `theme`, an unknown --list kind, --at without a picture, a picture that is not a PNG or is damaged or too big, an --at point that is not whole pixel numbers or falls outside the picture, a count beside --at, or a count that is not a positive whole number',
    },
    {
      code: 'ERR_FILE_NOT_FOUND',
      when: 'the picture does not exist',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: '`theme` names a theme the editor did not make',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: '@astryxdesign/core is not installed in the folder',
    },
  ],
  examples: [
    {
      label: 'A part',
      code: 'await themeEditHow(...)',
    },
  ],
  command: 'experimental theme editor how',
  related: ['themeBuild'],
};
