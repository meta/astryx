// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useThemeName',
  displayName: 'useThemeName',
  group: 'Utilities',
  category: 'Utility',
  keywords: [
    'theme',
    'theme name',
    'color mode',
    'provider',
    'branding',
    'semantic icons',
    'analytics',
  ],
  params: [],
  returns: [
    {
      name: 'name',
      type: 'string | null',
      description:
        "Name of the nearest active theme: the value from the enclosing Theme provider, or the root Theme's name read off <html data-astryx-theme>. null when no provider is present and no root Theme has synced the attribute.",
    },
  ],
  usage: {
    description:
      "Returns the identity of the active theme - just its name, none of the token machinery. It is intentionally lighter than useTheme: a provider-path consumer subscribes to nothing, and outside a provider it follows the root Theme's <html data-astryx-theme> attribute through one shared observer. Use it when a decision depends on which theme is active - resolving a semantic icon, picking a logo variant, labelling analytics - and reach for useTheme when you need token values.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use it for decisions that branch on theme identity, such as picking a logo or an illustration variant per brand theme.',
      },
      {
        guidance: true,
        description:
          'Handle null: without any Theme provider and before a root Theme has synced the attribute, the name is not known yet.',
      },
      {
        guidance: true,
        description:
          'Reach for useTheme when you need token values, and for a resolved light/dark mode. This hook answers "which theme", not "what does it look like".',
      },
      {
        guidance: false,
        description:
          'Read <html data-astryx-theme> yourself - the hook handles the provider path without DOM access and shares one observer among all consumers.',
      },
      {
        guidance: false,
        description:
          'Parse the name to infer colors or mode. A name is an identity string, not a token contract; useTheme resolves actual values.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Name of the active theme from the nearest Theme provider, or the root <html data-astryx-theme> attribute; null when neither is present.',
  paramDescriptions: {},
  returnDescriptions: {
    name: 'theme identity string, or null before any Theme is known.',
  },
  usage: {
    description:
      "Which theme is active, without token machinery. Lighter than useTheme; use useTheme for token values.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Branch on identity: logos, illustrations, analytics labels.',
      },
      {
        guidance: true,
        description: 'Handle null before any Theme is present.',
      },
      {
        guidance: false,
        description: 'Infer colors or mode from the name; use useTheme.',
      },
    ],
  },
};
