// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useDirection',
  displayName: 'useDirection',
  category: 'utilities',
  keywords: [
    'i18n',
    'internationalization',
    'direction',
    'dir',
    'ltr',
    'rtl',
    'bidirectional',
    'text direction',
    'canvas',
    'sparkline',
  ],
  params: [],
  returns: [
    {
      name: 'direction',
      type: "'ltr' | 'rtl'",
      description:
        "The ambient text direction ('ltr' or 'rtl') from the enclosing InternationalizationProvider, falling back to 'ltr' when called outside a provider.",
    },
  ],
  usage: {
    description:
      'Reads the current text direction during render. Reach for this hook as a last resort when render-time direction is strictly required (such as canvas drawing that cannot use CSS logical properties). In order of preference, always favor: CSS logical properties (margin-inline, inset-inline); shared mirror styles for directional icons (CSS scaleX); and DOM reads for keyboard or gesture logic.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Prefer CSS logical properties and directional CSS mirroring before using useDirection.',
      },
      {
        guidance: true,
        description:
          'Use useDirection when drawing on an HTML canvas or calculating non-CSS layout coordinates where the start edge depends on text direction.',
      },
      {
        guidance: false,
        description:
          'Use useDirection to conditionally swap margins, paddings, or inline alignments that can be solved with CSS logical properties.',
      },
    ],
  },
  relatedComponents: ['InternationalizationProvider'],
  relatedHooks: ['useLocale', 'useTranslator'],
  importPath: '@astryxdesign/core',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Returns the current text direction ('ltr' or 'rtl') during render. Render-time last resort: prefer CSS logical properties first.",
  usage: {
    description:
      'Reads ambient text direction during render. Prefer CSS logical properties, icon mirror styles, and DOM reads first. Use for canvas drawing or non-CSS coordinate calculation.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Prefer CSS logical properties before using useDirection.',
      },
      {
        guidance: true,
        description:
          'Use for HTML canvas rendering where time/value axes start from the logical inline start edge.',
      },
      {
        guidance: false,
        description:
          'Use to conditionally swap styles that CSS logical properties solve directly.',
      },
    ],
  },
  returnDescriptions: {
    direction: "ambient text direction ('ltr' or 'rtl'), defaulting to 'ltr'.",
  },
};
