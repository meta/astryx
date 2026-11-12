// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme editor set`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme editor set',
  displayName: 'astryx experimental theme editor set',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Change one thing in a theme: checked against what the components read, built, previewed',
  description:
    "Changes one thing. The thing is a dial (corners, spacing, accent, neutral, success, warning, danger, info, vibrancy, font, headings, surfaces, buttons, type, text-size, base, mode: big moves with named rungs; `more`/`less` step a rung), a design token by name (--color-background-body; `how --list tokens`), or a CSS property on a part (background --on card; needs --on). Every change is CHECKED first against the installed Core: the part, the --when variant and value, the --state, the token's type (color, size, number, font, shadow; only colors may differ by mode; a shadow is one value for both), and whether the part, or a part inside it, actually reads the token for what you mean. A change that cannot take effect is REFUSED: exit 1, an error code, nothing written, and the suggestions lead with the command that works (the token the part really reads, or the property that sets it directly). Groups: --on <group> (inputs, checks, containers, menus) styles every member; styling one member of an always-alike group (inputs, checks) styles the whole group unless --only. A setting on a part beats a whole-theme dial, and a dial never overwrites one. After building, a plain part setting that a more specific base-theme rule would beat (such as a heading level) is repeated on those variant keys, and the result says so. The result lists resolved token changes, part styles written, contrast problems this theme caused versus its base (text below 4.5:1), notes (the shade a color's main token uses, any shade moved so text reads, and the generated color files; font loading: the exact install line when the font package is missing), and writes themes/<theme>/preview.html. Values with spaces go in quotes: gradients, several shadows, font stacks. Dials: corners square|small|medium|large|round|pill|more|less|<size>; spacing tight|compact|medium|roomy|spacious|more|less; accent, neutral, success, warning, danger, info <color> (a color: the editor generates its light and dark shades from the one color, with the same generator as `theme palette generate`, and points the color tokens at them; a token moves to a nearby shade when it must read: text at 4.5:1, the focus ring at 3:1; the whole theme only, no --on or --mode; `how colors` explains it and the Colors preview page shows every shade); vibrancy 0-100|more|less (how saturated the generated colors are; 50 is the default; needs a color); font <preset, open font, family or stack>; headings light|regular|medium|semibold|bold|heavy or tight|tighter|normal|wide; surfaces flat|outlined|raised|glass; buttons solid|outline|soft|caps; type compact|standard|editorial|display; text-size small|medium|large|larger|more|less|<number of pixels, 10 to 32>; base <built-in theme>|none; mode both|light-only|dark-only. `astryx experimental theme editor how --list dials` explains each. An exact token always wins over the generated colors: `set <theme> --color-accent <color>` (with --on or --mode if you need them) is the escape hatch, whatever order the settings were made in. Experimental: it may change or be removed in a patch release.",
  fn: 'themeEditSet',
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
      name: 'value',
      param: 'value',
      required: true,
      variadic: true,
    },
  ],
  options: [
    {
      flag: '--on <where>',
      param: 'options.on',
      description:
        'Where it applies (default: the whole theme): a part (button, card, app-shell-header; how --list parts), a group (inputs, containers, checks, menus; how --list groups), or for font a role (body, heading, code)',
    },
    {
      flag: '--when <prop:value>',
      param: 'options.when',
      description:
        'Only that variant of the part, such as variant:primary or status:error (how <part> lists them); needs --on',
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
        'light or dark: only that color mode. Colors only; sizes, numbers, fonts and shadows are the same in both modes, and a light-only or dark-only theme takes no --mode',
    },
    {
      flag: '--only',
      param: 'options.only',
      description:
        'With one member of an always-alike group (inputs, checks), style just that part instead of the whole group',
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
      label: 'A big move with a dial',
      cli: 'astryx experimental theme editor set brand corners pill',
    },
    {
      label: 'Step a dial',
      cli: 'astryx experimental theme editor set brand spacing more',
    },
    {
      label: 'The brand color: its shades are generated, light and dark',
      cli: 'astryx experimental theme editor set brand accent "#7c3aed"',
    },
    {
      label: 'The gray of surfaces and text',
      cli: 'astryx experimental theme editor set brand neutral "#64748b"',
    },
    {
      label: 'How saturated the generated colors are',
      cli: 'astryx experimental theme editor set brand vibrancy 70',
    },
    {
      label: 'An exact accent that wins over the generated colors',
      cli: 'astryx experimental theme editor set brand --color-accent "#7c3aed"',
    },
    {
      label: 'A token, dark mode only',
      cli: 'astryx experimental theme editor set brand --color-text-primary "#e5e7eb" --mode dark',
    },
    {
      label: 'A CSS property on a part',
      cli: 'astryx experimental theme editor set brand background "linear-gradient(#f6d365, #fda085)" --on app-shell-header',
    },
    {
      label: 'One variant in one state',
      cli: 'astryx experimental theme editor set brand background-color "#f3e8ff" --on button --when variant:ghost --state hover',
    },
    {
      label: 'Every input',
      cli: 'astryx experimental theme editor set brand border "1px solid #9ca3af" --on inputs',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme editor set writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the change is written, built and previewed (notes and contrast problems included); or written but not checked, when the components could not be rendered: the output starts with [warn] saved, not checked (ERR_THEME_NOT_CHECKED) and the cause, such as two copies of React',
    },
    {
      code: 1,
      when: 'an unknown option, a refused change (an unknown part, variant, state, token or thing; a value of the wrong type; --mode on something that has no mode; a token the part never reads for that; corners on a part that shows no edge), a theme that does not exist, or a build failure, or a folder outside a project with Core installed (ERR_PROJECT_REQUIRED); nothing is written',
    },
  ],
  related: ['experimental theme editor', 'experimental theme compile'],
};
