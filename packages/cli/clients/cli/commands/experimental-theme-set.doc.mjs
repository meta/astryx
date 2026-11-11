// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @file CommandDoc for `astryx experimental theme set`. */

/** @type {import('@astryxdesign/cli/authoring').CommandDoc} */
export const doc = {
  type: 'command',
  name: 'experimental theme set',
  displayName: 'astryx experimental theme set',
  namespace: 'cli/commands',
  stability: 'experimental',
  summary:
    'Change one thing in a theme: checked against what the components read, built, previewed',
  description:
    "Changes one thing. The thing is a dial (corners, spacing, accent, font, headings, surfaces, buttons, type, text-size, base, mode: big moves with named rungs; `more`/`less` step a rung), a design token by name (--color-background-body; `explain --list tokens`), or a CSS property on a part (background --on card; needs --on). Every change is CHECKED first against the installed Core: the part, the --when variant and value, the --state, the token's type (color, size, number, font, shadow; only colors and shadows may differ by mode), and whether the part, or a part inside it, actually reads the token for what you mean. A change that cannot take effect is REFUSED: exit 1, an error code, nothing written, and the suggestions lead with the command that works (the token the part really reads, or the property that sets it directly). Families: --on <family> styles every member; styling one member of an always-alike family (inputs, checks) styles the whole family unless --only. A setting on a part beats a whole-theme dial, and a dial never overwrites one. After building, a plain part setting that a more specific base-theme rule would beat (such as a heading level) is repeated on those variant keys, and the result says so. The result lists resolved token changes, part styles written, contrast problems this theme caused versus its base (text below 4.5:1), notes (accent text per mode, font loading), and writes themes/<theme>/preview.html. Values with spaces go in quotes: gradients, several shadows, font stacks. Dials: corners square|small|medium|large|round|pill|more|less|<size>; spacing tight|compact|medium|roomy|spacious|more|less; accent <color> (kept exact; accent text is made readable per mode); font <preset, open font, family or stack>; headings light|regular|medium|semibold|bold|heavy or tight|tighter|normal|wide; surfaces flat|outlined|raised|glass; buttons solid|outline|soft|caps; type compact|standard|editorial|display; text-size small|medium|large|larger|more|less|<number>; base <built-in theme>|none; mode both|light-only|dark-only. `astryx experimental theme explain --list dials` explains each. Experimental: it may change or be removed in a patch release.",
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
        'Where it applies (default: the whole theme): a part (button, card, app-shell-header; explain --list parts), a family (inputs, containers, checks, menus; explain --list families), or for font a role (body, heading, code)',
    },
    {
      flag: '--when <prop:value>',
      param: 'options.when',
      description:
        'Only that variant of the part, such as variant:primary or status:error (explain <part> lists them); needs --on',
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
        'light or dark: only that color mode. Colors and shadows only; sizes, numbers and fonts are the same in both modes, and a light-only or dark-only theme takes no --mode',
    },
    {
      flag: '--only',
      param: 'options.only',
      description:
        'With one member of an always-alike family (inputs, checks), style just that part instead of the whole family',
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
      cli: 'astryx experimental theme set brand corners pill',
    },
    {
      label: 'Step a dial',
      cli: 'astryx experimental theme set brand spacing more',
    },
    {
      label: 'The brand color',
      cli: 'astryx experimental theme set brand accent "#7c3aed"',
    },
    {
      label: 'A token, dark mode only',
      cli: 'astryx experimental theme set brand --color-text-primary "#e5e7eb" --mode dark',
    },
    {
      label: 'A CSS property on a part',
      cli: 'astryx experimental theme set brand background "linear-gradient(#f6d365, #fda085)" --on app-shell-header',
    },
    {
      label: 'One variant in one state',
      cli: 'astryx experimental theme set brand background-color "#f3e8ff" --on button --when variant:ghost --state hover',
    },
    {
      label: 'Every input',
      cli: 'astryx experimental theme set brand border "1px solid #9ca3af" --on inputs',
    },
  ],
  outsideProject: 'refuse',
  notes: [
    {
      type: 'prose',
      text: "In global mode: outside a project, with no package.json in the folder or above it, experimental theme set writes nothing and stops with `ERR_PROJECT_REQUIRED`; run it in the app project. In a project, the project's version of Astryx runs it, whichever astryx command you start. See {@link namespace:global} and {@link generic:problems}.",
    },
  ],
  exitCodes: [
    {
      code: 0,
      when: 'the change is written, built and previewed (notes and contrast problems included)',
    },
    {
      code: 1,
      when: 'a refused change (an unknown part, variant, state, token or thing; a value of the wrong type; --mode on something that has no mode; a token the part never reads for that; corners on a part that shows no edge), a theme that does not exist, or a build failure; nothing is written',
    },
  ],
  related: ['experimental theme', 'experimental theme compile'],
};
