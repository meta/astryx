// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useMediaQuery',
  displayName: 'useMediaQuery',
  keywords: ['responsive', 'breakpoint', 'media', 'mobile', 'desktop', 'screen', 'matchmedia'],
  params: [
    {
      name: 'query',
      type: 'string',
      description: 'CSS media query string to evaluate.',
      required: true,
    },
  ],
  returns: [
    {
      name: 'matches',
      type: 'boolean',
      description: 'Whether the media query currently matches. Always false on first render (SSR-safe).',
    },
  ],
  usage: {
    description: 'SSR-safe media query hook that subscribes to window.matchMedia changes. Returns whether the given media query matches. Always returns false on first render for SSR compatibility. Where `window.matchMedia` is missing, it returns its server default and never throws.',
    bestPractices: [
      { guidance: true, description: 'Use for responsive layout switching based on viewport width, color scheme, or motion preferences.' },
      { guidance: true, description: 'Prefer Astryx responsive tokens and component props over manual breakpoint logic when possible.' },
      { guidance: false, description: 'Use for server-rendered content that must match on first paint; the hook always returns false initially.' },
    ],
  },
  relatedComponents: [],
  relatedHooks: ['useImageMode'],
  importPath: '@astryxdesign/core/hooks',
  category: 'media',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description: 'SSR-safe media query hook subscribing to window.matchMedia changes. Returns whether given media query matches. Always returns false on first render for SSR compatibility.',
  paramDescriptions: {
    query: 'CSS media query string to evaluate.',
  },
  returnDescriptions: {
    matches: 'whether media query currently matches. Always false on first render (SSR-safe).',
  },
  usage: {
    description: 'SSR-safe media query hook subscribing to window.matchMedia changes. Returns whether given media query matches. Always returns false on first render for SSR compatibility. Where `window.matchMedia` is missing, returns its server default and never throws.',
    bestPractices: [
      { guidance: true, description: 'Use for responsive layout switching based on viewport width, color scheme, or motion preferences.' },
      { guidance: true, description: 'Prefer Astryx responsive tokens + component props over manual breakpoint logic when possible.' },
      { guidance: false, description: 'Use for server-rendered content that must match on first paint; hook always returns false initially.' },
    ],
  },
};
