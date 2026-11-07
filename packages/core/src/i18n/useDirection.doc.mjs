// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useDirection',
  displayName: 'useDirection',
  keywords: [
    'direction',
    'rtl',
    'ltr',
    'i18n',
    'internationalization',
    'text direction',
    'right-to-left',
    'locale',
    'canvas',
    'mirror',
  ],
  params: [],
  returns: [
    {
      name: '(return value)',
      type: "'ltr' | 'rtl'",
      description:
        "The ambient text direction from the nearest InternationalizationProvider. 'ltr' when called outside any provider, matching the silent-en-fallback pattern of useTranslator.",
    },
  ],
  usage: {
    description:
      "Returns the current text direction ('ltr' or 'rtl') during render. It is a last resort: prefer CSS logical properties (margin-inline-start, inset-inline-end) first; then the shared mirror styles for directional icons (a CSS scaleX, not a JS icon-name swap); then a lazy DOM read (isRtlElement) for behavioral logic such as keyboard navigation or drag math. Reach for this hook only when you need the direction value during render and none of those fit — canvas and SVG drawing, where no CSS applies and geometry is computed in JS. Note the provider's direction can mismatch the actual <html dir> on hydration when the two disagree; keep them in sync via getLocaleDirection.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Prefer CSS logical properties (margin-inline-start, padding-inline-end) for layout mirroring; they follow the DOM dir attribute with no JavaScript.',
      },
      {
        guidance: true,
        description:
          'Mirror directional icons with the shared rtlStyles.mirror (CSS scaleX) rather than swapping icon names by direction in JS.',
      },
      {
        guidance: true,
        description:
          'For behavioral logic that can read the DOM lazily (keyboard navigation, drag math), use isRtlElement at event time instead of holding render-time state.',
      },
      {
        guidance: false,
        description:
          'Use this hook for layout that CSS logical properties already mirror — it adds a re-render dependency where plain CSS follows dir for free.',
      },
    ],
  },
  relatedComponents: ['InternationalizationProvider'],
  relatedHooks: ['useTranslator'],
  importPath: '@astryxdesign/core',
  category: 'i18n',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Returns the ambient text direction ('ltr' | 'rtl') during render, from the nearest InternationalizationProvider ('ltr' outside one). Last resort: CSS logical properties, shared icon mirror styles and lazy DOM reads come first.",
  paramDescriptions: {},
  returnDescriptions: {
    '(return value)': "'ltr' | 'rtl' from context; 'ltr' outside a provider.",
  },
  usage: {
    description:
      'Render-time direction for JS-computed geometry (canvas/SVG axes) that CSS logical properties cannot mirror. Prefer logical CSS → icon mirror styles → lazy DOM reads first; can mismatch <html dir> on hydration when the two disagree.',
    bestPractices: [
      {
        guidance: true,
        description: 'CSS logical properties for layout mirroring.',
      },
      {
        guidance: true,
        description: 'Shared mirror styles (scaleX) for directional icons.',
      },
      {
        guidance: true,
        description: 'isRtlElement at event time for keyboard/drag math.',
      },
      {
        guidance: false,
        description: 'This hook where logical CSS already mirrors dir.',
      },
    ],
  },
};
