// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useEntryAnimation',
  displayName: 'useEntryAnimation',
  keywords: ['animation', 'entry', 'mount', 'transition', 'slide', 'fade', 'scale', 'motion', 'stylex'],
  params: [
    {
      name: 'preset',
      type: "'slideDown' | 'slideUp' | 'fadeIn' | 'scaleIn'",
      description: 'Animation preset to apply on mount.',
      default: "'slideDown'",
      required: false,
    },
  ],
  returns: [
    {
      name: 'entryStyle',
      type: 'StyleXStyles | null',
      description: 'A StyleX style object for the entry animation, or null if the element was rendered on initial page load or hydrated from server HTML (no animation needed).',
    },
  ],
  usage: {
    description:
      'Returns a StyleX style for animating an element on mount. Only animates when the element is dynamically inserted after the initial page paint; elements rendered on page load are not animated. Uses Astryx motion tokens (duration, easing) for consistent animation timing. Server-rendered elements hydrate without the entry style and never animate; elements mounted after hydration animate.',
    bestPractices: [
      { guidance: true, description: 'Use for conditionally rendered elements like validation messages, toasts, or expanding sections.' },
      { guidance: true, description: 'Spread the returned style into stylex.props() alongside other styles.' },
      { guidance: false, description: 'Use for elements that should be visible on initial page load; they will not animate.' },
    ],
  },
  relatedComponents: ['FieldStatus'],
  relatedHooks: [],
  importPath: '@astryxdesign/core/hooks',
  category: 'animation',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Returns StyleX style for animating element on mount. Only animates when element dynamically inserted after initial page paint; elements rendered on page load not animated. Uses Astryx motion tokens (duration, easing) for consistent timing. Server-rendered elements hydrate without entry style, never animate; elements mounted after hydration animate.',
  paramDescriptions: {
    preset: 'animation preset applied on mount.',
  },
  returnDescriptions: {
    entryStyle: 'StyleX style object for entry animation / null if element rendered on initial page load (no animation needed).',
  },
  usage: {
    description:
      'Returns StyleX style for animating element on mount. Only animates when element dynamically inserted after initial page paint; elements rendered on page load not animated. Uses Astryx motion tokens (duration, easing) for consistent timing. Server-rendered elements hydrate without entry style, never animate; elements mounted after hydration animate.',
    bestPractices: [
      { guidance: true, description: 'Use for conditionally rendered elements like validation messages, toasts, expanding sections.' },
      { guidance: true, description: 'Spread returned style into stylex.props() alongside other styles.' },
      { guidance: false, description: 'Use for elements that should be visible on initial page load; they will not animate.' },
    ],
  },
};
