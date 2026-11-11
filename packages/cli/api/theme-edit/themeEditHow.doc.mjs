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
    'One command for every question. A part (button, card; --list parts): what it reads for each aspect (text, background, border, corners, shadow, spacing, font, size) and under which variant or state, its variants (--when) and states (--state), the parts inside it (a token set --on the part reaches them), and its group. A group (inputs, containers, checks, menus): its members and whether styling one styles all. A setting: a dial\'s rungs and examples, a token\'s type, default and the parts that read it, or a CSS property and the parts that set it. An aspect (text, background, border, corners, shadow, spacing, font, size): the dial and the whole-theme tokens most parts read for it. `colors` (or `palette`): how the theme\'s colors are made: one seed per color, light and dark shades generated with the same generator as `theme palette generate`, the shade each token starts from, vibrancy, the Colors preview page and the exact-token escape hatch; a color (accent, neutral, success, warning, danger, info) also lists the shade each token starts from. Color questions in plain words ("brand color", "make it more colorful", "dark mode colors", "error red", "see all shades", "exact color for one token") get one line of what happens and the commands. A question in plain words ("bold white text in the header", "glossy gradient header"): it finds the parts (header, nav links, banner, cards, inputs, buttons and their variants...) and aspects (text color, background, gradient, corners, border, shadow or bevel, spacing, font, bold, letter spacing) and answers with exact commands from what each part really reads: the direct property (always works) and the token route; a part with variants says a change without --when reaches every variant. A PNG picture: its main colors, biggest share first, with where each sits (a number after the file sets how many, default 14), or with --at the exact color at pixel points (no browser needed). --list <what> lists what a change can name (dials, tokens, parts, groups or properties; --list alone lists those kinds), and any words after <what> filter the list. Experimental: it may change or be removed in a patch release.',
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
      name: 'options.cwd',
      type: 'string',
      description: 'The app folder.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.how',
      description:
        '`kind` says which answer it is: part (variants, states, reads per aspect, parts inside, group), group (members), setting, aspect or question (answers with commands), picture (main colors or the color at points), or list (the items).',
    },
  ],
  throws: [
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'nothing named',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: 'an unknown --list kind, --at without a picture, a picture that is not a PNG, an odd count of numbers in --at, or a bad count',
    },
    {
      code: 'ERR_FILE_NOT_FOUND',
      when: 'the picture does not exist',
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
