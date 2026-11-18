// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file FunctionDoc for `themeEditSet()` / `astryx experimental theme editor set`. */

/** @type {import('@astryxdesign/cli/authoring').FunctionDoc} */
export const doc = {
  type: 'function',
  kind: 'api',
  name: 'themeEditSet',
  namespace: 'cli/api',
  stability: 'experimental',
  displayName: 'themeEditSet()',
  summary:
    'Change one thing in a theme: checked against what the components read, built, previewed.',
  description:
    "Changes one thing. The thing is a dial (corners, spacing, accent, neutral, success, warning, danger, info, vibrancy, font, headings, surfaces, buttons, type, text-size, base, mode: big moves with named rungs; `more`/`less` step a rung), a design token by name (--color-background-body; `how --list tokens`), or a CSS property on a part (background --on card; needs --on). Every change is CHECKED first against the installed Core: the part, the --when variant and value, the --state, the token's type (color, size, number, font, shadow; only colors may differ by mode; a shadow is one value for both), and whether the part, or a part inside it, actually reads the token for what you mean. A change that cannot take effect is REFUSED: exit 1, an error code, nothing written, and the suggestions lead with the command that works (the token the part really reads, or the property that sets it directly). Groups: --on <group> (inputs, checks, containers, menus) styles every member; styling one member of an always-alike group (inputs, checks) styles the whole group unless --only. A setting on a part beats a whole-theme dial, and a dial never overwrites one. After building, a plain part setting that a more specific base-theme rule would beat (such as a heading level) is repeated on those variant keys, and the result says so. The result lists resolved token changes, part styles written, contrast problems this theme caused versus its base (text below 4.5:1), notes (the shade a color's main token uses, any shade moved so text reads, and the generated color files; font loading: the exact install line when the font package is missing), and writes themes/<theme>/preview.html; when sheet.html (made by `show`) now shows the theme as it was, it says so at its top and the result's sheetStale says so. Values with spaces go in quotes: gradients, several shadows, font stacks. Dials: corners square|small|medium|large|round|pill|more|less|<size>; spacing tight|compact|medium|roomy|spacious|more|less; accent, neutral, success, warning, danger, info <color> (a color: the editor generates its light and dark shades from the one color, with the same generator as `theme palette generate`, and points the color tokens at them; a token moves to a nearby shade when it must read: text at 4.5:1, the focus ring at 3:1; the whole theme only, no --on or --mode; `how colors` explains it and the Colors preview page shows every shade); vibrancy 0-100|more|less (how saturated the generated colors are; 50 is the default; needs a color); font <preset, open font, family or stack>; headings light|regular|medium|semibold|bold|heavy or tight|tighter|normal|wide; surfaces flat|outlined|raised|glass; buttons solid|outline|soft|caps; type compact|standard|editorial|display; text-size small|medium|large|larger|more|less|<number of pixels, 10 to 32>; base <built-in theme>|none; mode both|light-only|dark-only. `astryx experimental theme editor how --list dials` explains each. An exact token always wins over the generated colors: `set <theme> --color-accent <color>` (with --on or --mode if you need them) is the escape hatch, whatever order the settings were made in. Experimental: it may change or be removed in a patch release.",
  importPath: '@astryxdesign/cli/api/experimental',
  signature:
    'themeEditSet(theme: string, thing: string, value: string, options?: object): Promise<object>',
  keywords: [
    'theme',
    'experimental theme',
    'set',
    'design tokens',
    'type-checked',
  ],
  params: [
    {
      name: 'theme',
      type: 'string',
      description: 'The theme name.',
      required: true,
    },
    {
      name: 'thing',
      type: 'string',
      description: 'A dial, a design token, or a CSS property.',
      required: true,
    },
    {
      name: 'value',
      type: 'string',
      description:
        "The value: a dial rung, `more`/`less`, or an exact value of the thing's type.",
      required: true,
    },
    {
      name: 'options.on',
      type: 'string',
      description: 'A part, a group, or for `font` a role.',
    },
    {
      name: 'options.when',
      type: 'string',
      description: '`<prop>:<value>`: only that variant.',
    },
    {
      name: 'options.state',
      type: 'string',
      description: 'Only that state.',
    },
    {
      name: 'options.mode',
      type: 'string',
      description:
        '`light` or `dark`: only that color mode (colors only; a shadow is one value for both modes).',
    },
    {
      name: 'options.only',
      type: 'boolean',
      description:
        'With a member of an always-alike group, style just that part.',
    },
    {
      name: 'options.png',
      type: 'boolean',
      description: 'Also take PNG pictures of the preview.',
    },
    {
      name: 'options.cwd',
      type: 'string',
      description:
        'The folder to start from (default: the current directory): commands act on the Astryx project at or above it, so a subfolder of an app works.',
    },
  ],
  returns: [
    {
      type: 'themeEdit.set',
      description:
        'The setting written and the one it replaced, the parts and group it styles, resolved token changes, part styles written, part settings a dial kept, newly lifted variant keys, notes, contrast problems, build warnings, and the preview.',
    },
  ],
  throws: [
    {
      code: 'ERR_MISSING_ARGUMENT',
      when: 'no thing or value, or --when/--state without --on',
    },
    {
      code: 'ERR_THEME_UNKNOWN_PART',
      when: '--on is not a part or a group',
    },
    {
      code: 'ERR_THEME_UNKNOWN_VARIANT',
      when: '--when names a prop or value the part does not have',
    },
    {
      code: 'ERR_THEME_UNKNOWN_STATE',
      when: '--state is not a state of the part',
    },
    {
      code: 'ERR_THEME_UNKNOWN_TOKEN',
      when: 'the token does not exist',
    },
    {
      code: 'ERR_THEME_PRIVATE_TOKEN',
      when: 'the variable is private to a component',
    },
    {
      code: 'ERR_THEME_UNKNOWN_THING',
      when: 'the thing is not a dial, a token or a CSS property',
    },
    {
      code: 'ERR_THEME_BAD_VALUE',
      when: 'the value does not fit the thing',
    },
    {
      code: 'ERR_THEME_NO_MODE',
      when: '--mode on something that cannot differ by mode',
    },
    {
      code: 'ERR_THEME_NO_EFFECT',
      when: 'the change could not take effect; the suggestions name what works',
    },
    {
      code: 'ERR_THEME_NOT_SET',
      when: '`reset` names a setting the theme does not have',
    },
    {
      code: 'ERR_INVALID_ARGUMENT',
      when: '--only on a part that is not a member of an always-alike group',
    },
    {
      code: 'ERR_UNKNOWN_THEME',
      when: 'the theme does not exist; the suggestion is the `new` command',
    },
    {
      code: 'ERR_PROJECT_REQUIRED',
      when: '@astryxdesign/core is not installed in the folder',
    },
    {
      code: 'ERR_THEME_BUSY',
      when: 'another command is changing the same theme and did not finish within 30 seconds; nothing was changed',
    },
    {
      code: 'ERR_THEME_INVALID',
      when: 'the theme does not build (the change is undone)',
    },
    {
      code: 'ERR_RENDER_FAILED',
      when: "the components or the preview do not render with the project's React",
    },
  ],
  examples: [
    {
      label: 'A big move with a dial',
      code: 'await themeEditSet(...)',
    },
  ],
  command: 'experimental theme editor set',
  related: ['themeBuild', 'themePaletteGenerate'],
};
