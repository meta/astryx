// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useTheme',
  displayName: 'useTheme',
  group: 'Utilities',
  category: 'Utility',
  keywords: [
    'theme',
    'tokens',
    'color',
    'mode',
    'dark',
    'light',
    'provider',
    'data visualization',
    'canvas',
    'svg',
    'chart',
  ],
  params: [],
  returns: [
    {
      name: 'name',
      type: 'string',
      description:
        'Name of the nearest theme, or default when no provider is present.',
    },
    {
      name: 'mode',
      type: "'light' | 'dark'",
      description:
        'Resolved effective color mode. system mode is resolved to light or dark.',
    },
    {
      name: 'token',
      type: '(name: string) => string',
      description:
        'Resolve a single design token to its current CSS value for the effective mode.',
    },
    {
      name: 'tokens',
      type: 'Record<string, string>',
      description:
        'All tokens resolved for the current mode, including defaults and theme overrides. Stable until the active theme or mode changes; uses the same resolution logic as resolveThemeTokens(theme, {mode}).',
    },
  ],
  usage: {
    description:
      'Programmatic access to theme tokens for non-CSS consumers like SVG, canvas, Vega, D3, maps, or chart libraries that need values in JavaScript instead of CSS custom property references.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use tokens or token(name) when integrating theme colors into SVG attributes, canvas drawing, chart options, or other non-CSS configuration objects inside React components.',
      },
      {
        guidance: true,
        description:
          'Use resolveThemeTokens(theme, {mode}) for the same token resolution outside React hooks.',
      },
      {
        guidance: true,
        description:
          'Prefer CSS variables or StyleX tokens for ordinary component styling; use this hook only when JavaScript needs token values.',
      },
      {
        guidance: true,
        description:
          'Use data visualization tokens such as --color-data-categorical-blue for chart series instead of arbitrary UI colors.',
      },
      {
        guidance: false,
        description:
          'Hardcode light/dark colors in data visualizations: resolve them through the current theme instead.',
      },
      {
        guidance: false,
        description:
          'Assume the hook reflects every CSS cascade override. It resolves tokens for the current Theme mode; local media-surface overrides and arbitrary external CSS may not be represented.',
      },
    ],
  },
  relatedComponents: ['Theme'],
  relatedHooks: ['useMediaQuery'],
  importPath: '@astryxdesign/core/theme',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Programmatic access to theme tokens for SVG/canvas/charts needing JS values instead of CSS vars.',
  returnDescriptions: {
    name: 'nearest theme name or default.',
    mode: 'resolved light/dark mode.',
    token: 'resolve one design token for effective mode.',
    tokens:
      'all tokens resolved for current mode; stable until theme/mode changes; same resolver as resolveThemeTokens.',
  },
  usage: {
    description:
      'Programmatic access to theme tokens for SVG/canvas/charts needing JS values instead of CSS vars.',
    bestPractices: [
      {
        guidance: true,
        description: 'Use tokens/token(name) for SVG/canvas/chart config theme colors in React.',
      },
      {
        guidance: true,
        description:
          'Use resolveThemeTokens(theme, {mode}) outside React hooks.',
      },
      {
        guidance: true,
        description:
          'Prefer CSS vars / StyleX tokens for ordinary styling; use hook when JS needs values.',
      },
      {
        guidance: true,
        description: 'Use --color-data-* tokens for chart series.',
      },
      {
        guidance: false,
        description: 'Hardcode light/dark chart colors: resolve from current theme.',
      },
      {
        guidance: false,
        description:
          'Assume hook reflects arbitrary CSS cascade/media-surface overrides.',
      },
    ],
  },
};
