// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useThemeName',
  displayName: 'useThemeName',
  keywords: ['theme', 'name', 'identity', 'provider', 'icon'],
  params: [],
  returns: [
    {
      name: 'name',
      type: 'string | null',
      description:
        'The nearest Theme name. Null when no Theme context is present and the root has not set a theme name.',
    },
  ],
  usage: {
    description:
      'Reads only the active theme name. Use it when code needs to know which theme is on, and does not need tokens or the color mode. It reads ThemeContext when a Theme is above the caller, and otherwise the root theme name on the document element.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use this hook for theme identity, such as picking a semantic icon for the active theme.',
      },
      {
        guidance: true,
        description:
          'Use useTheme when the caller also needs token values or the resolved light or dark mode.',
      },
      {
        guidance: false,
        description:
          'Treat null as the name default. Null means no theme name is available.',
      },
    ],
  },
  relatedComponents: ['Theme'],
  relatedHooks: ['useTheme'],
  importPath: '@astryxdesign/core/theme',
  category: 'Utility',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'The nearest theme name, or null when none is set. Lighter than useTheme.',
  returnDescriptions: {
    name: 'nearest Theme name, or null when no theme name is available.',
  },
  usage: {
    description:
      'The active theme name only. Reads ThemeContext, else the root theme name.',
    bestPractices: [
      {
        guidance: true,
        description: 'Use it when only the theme name is needed.',
      },
      {
        guidance: true,
        description: 'Use useTheme for tokens or the color mode.',
      },
      {
        guidance: false,
        description: 'Treat null as a theme named default.',
      },
    ],
  },
};
