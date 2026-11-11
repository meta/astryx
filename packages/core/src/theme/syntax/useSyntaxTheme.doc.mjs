// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useSyntaxTheme',
  displayName: 'useSyntaxTheme',
  group: 'Utilities',
  category: 'Utility',
  keywords: [
    'syntax theme',
    'code',
    'syntax highlighting',
    'tokens',
    'canvas',
    'svg',
    'color',
    'diff',
  ],
  params: [],
  returns: [
    {
      name: 'name',
      type: 'string',
      description: 'Name of the syntax theme in scope.',
    },
    {
      name: 'mode',
      type: "'light' | 'dark'",
      description: 'Resolved effective color mode.',
    },
    {
      name: 'token',
      type: '(name: SyntaxThemeTokenKey) => string',
      description:
        "Resolve one syntax token (keyword, comment, string, ...) to its raw CSS value for the current mode - a value a canvas fillStyle or an SVG attribute can use.",
    },
    {
      name: 'tokens',
      type: 'Record<SyntaxThemeTokenKey, string>',
      description:
        'All syntax tokens resolved for the current mode. Diff marker slots the theme did not set follow the CSS default and derive from the enclosing page theme.',
    },
  ],
  usage: {
    description:
      'Programmatic access to the syntax colors in scope, for consumers that paint outside CSS - a canvas code view, an SVG diagram, a custom diff renderer. Returns null when no SyntaxTheme provider is above the caller, so the caller can fall back instead of guessing colors. The mode follows the page through useTheme and the OS preference, matching what the CSS custom properties resolve to.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Handle the null return: outside a SyntaxTheme provider there are no syntax colors in scope, so fall back to your own palette or render nothing.',
      },
      {
        guidance: true,
        description:
          'Use token(name) for one-off paints and tokens when a canvas frame or a chart option needs the full set - both return concrete values, not CSS var references.',
      },
      {
        guidance: true,
        description:
          'Render code text with Code or CodeBlock, which apply the same theme through CSS, and keep this hook for the parts CSS cannot reach.',
      },
      {
        guidance: false,
        description:
          'Read the CSS custom properties off a probe element - the hook resolves the same values without DOM reads.',
      },
      {
        guidance: false,
        description:
          'Expect the diff marker tokens (added/removed row slots) to come from the theme itself: unset slots derive from the enclosing page theme, by design.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Syntax colors in scope as concrete values (name, mode, token, tokens); null without a SyntaxTheme provider.',
  paramDescriptions: {},
  returnDescriptions: {
    name: 'syntax theme name.',
    mode: "'light' | 'dark' effective mode.",
    token: 'one syntax token as a raw CSS value.',
    tokens: 'all syntax tokens for the current mode.',
  },
  usage: {
    description:
      'Syntax token values for canvas/SVG/custom renderers; null without a provider.',
    bestPractices: [
      {
        guidance: true,
        description: 'Handle null outside a SyntaxTheme provider.',
      },
      {
        guidance: true,
        description:
          'Render code text with Code/CodeBlock; keep the hook for non-CSS paints.',
      },
      {
        guidance: false,
        description: 'Probe the DOM for CSS values; the hook resolves them.',
      },
    ],
  },
};
