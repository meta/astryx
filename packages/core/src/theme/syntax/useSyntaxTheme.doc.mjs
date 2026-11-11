// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useSyntaxTheme',
  displayName: 'useSyntaxTheme',
  keywords: [
    'syntax',
    'code',
    'theme',
    'tokens',
    'canvas',
    'highlight',
    'color',
  ],
  params: [],
  returns: [
    {
      name: 'name',
      type: 'string',
      description: 'Name of the syntax theme from the nearest SyntaxTheme.',
    },
    {
      name: 'mode',
      type: "'light' | 'dark'",
      description:
        'The color mode used to resolve tokens. It follows the prefers-color-scheme query.',
    },
    {
      name: 'token',
      type: '(name: SyntaxThemeTokenKey) => string',
      description:
        'The CSS color for one syntax token in the current mode, such as keyword.',
    },
    {
      name: 'tokens',
      type: 'Record<SyntaxThemeTokenKey, string>',
      description: 'Every syntax token resolved for the current mode.',
    },
  ],
  usage: {
    description:
      'Reads syntax colors for a canvas or other drawing that cannot use the CSS variables SyntaxTheme sets. Call it under a SyntaxTheme. It returns null when that provider is absent, so the caller can skip drawing.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Render the drawing under the same SyntaxTheme that colors the surrounding code.',
      },
      {
        guidance: true,
        description:
          'Check for null before reading token. The hook returns null with no SyntaxTheme above it.',
      },
      {
        guidance: false,
        description:
          'Copy syntax colors into the canvas by hand. They drift from the active syntax theme.',
      },
    ],
  },
  relatedComponents: ['SyntaxTheme', 'CodeBlock'],
  importPath: '@astryxdesign/core/theme/syntax',
  category: 'Utility',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Syntax colors for canvas drawing under a SyntaxTheme. Null when no provider is present.',
  returnDescriptions: {
    name: 'syntax theme name.',
    mode: 'light or dark from prefers-color-scheme.',
    token: 'CSS color for one syntax token in the current mode.',
    tokens: 'every syntax token for the current mode.',
  },
  usage: {
    description:
      'Syntax colors for a canvas under SyntaxTheme. Null when the provider is absent.',
    bestPractices: [
      {
        guidance: true,
        description: 'Draw under the same SyntaxTheme as the surrounding code.',
      },
      {
        guidance: true,
        description: 'Check for null before calling token.',
      },
      {
        guidance: false,
        description: 'Hardcode syntax colors in the canvas.',
      },
    ],
  },
};
