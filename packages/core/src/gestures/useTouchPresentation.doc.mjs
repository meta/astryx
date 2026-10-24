// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useTouchPresentation',
  displayName: 'useTouchPresentation',
  stability: 'experimental',
  keywords: [
    'touch',
    'phone',
    'mobile',
    'compact',
    'coarse pointer',
    'sheet',
    'popover',
    'adaptive',
    'size class',
    'media query',
    'SSR',
  ],
  params: [
    {
      name: 'serverDefault',
      type: '{isTouch?: boolean; isCompact?: boolean}',
      description:
        'What to render before hydration, where no media query can be read (for example from a user-agent hint). Both default to false.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'isTouch',
      type: 'boolean',
      description:
        'The primary pointer is coarse, a finger: `(pointer: coarse)`. Key touch behaviors on it.',
    },
    {
      name: 'isCompact',
      type: 'boolean',
      description:
        "The viewport is compact: narrower than the theme's `md` point (768px by default) or shorter than 500px, the same numbers on every platform. Key layout on it.",
    },
    {
      name: 'isCompactTouch',
      type: 'boolean',
      description:
        'Both, for presentations that need both, such as a bottom sheet in place of a popover.',
    },
  ],
  usage: {
    description:
      'Experimental: this hook may change or be removed in a patch release. The one answer to "is this a touch presentation?" that Astryx\'s adaptive components share, so a menu, a selector and a sheet never disagree on one device. It is SSR-safe: it renders the server default, then updates after hydration and when the conditions change (a window resized, a mouse attached). Touch behavior is one model on every touch device; nothing here chooses a platform. A phone in landscape is compact by its height. `readTouchPresentation()` reads the same answer once, for a decision taken at one moment, such as how a menu presents as it opens. For styles, write the same queries as media keys (`@media (pointer: coarse)`), so the first paint is already right.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Choose touch behaviors on isTouch, layout on isCompact, and sheet-versus-popover on isCompactTouch.',
      },
      {
        guidance: true,
        description:
          'Pass a serverDefault when the server knows the device, to avoid a layout change after hydration.',
      },
      {
        guidance: false,
        description:
          'Write your own phone media query; components would disagree about the same device.',
      },
    ],
  },
  relatedHooks: ['useGestureRecognizer'],
  importPath: '@astryxdesign/core/gestures/experimental',
  category: 'layout',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Experimental (may change or be removed in a patch release). Shared touch-presentation answer: isTouch (coarse pointer), isCompact (width below the theme md point, 768px by default, or height < 500px), isCompactTouch (both). SSR-safe; readTouchPresentation() for one-moment decisions.',
  paramDescriptions: {
    serverDefault: 'pre-hydration answer {isTouch?, isCompact?}; both false.',
  },
  returnDescriptions: {
    isTouch: '(pointer: coarse): key touch behaviors on it.',
    isCompact: 'width below md (768px) or height < 500px: key layout on it.',
    isCompactTouch: 'both: sheet in place of popover.',
  },
  usage: {
    description:
      "Experimental. One touch-presentation answer shared by Astryx's adaptive components; SSR-safe, live. Styles use the same media queries.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Touch behaviors on isTouch, layout on isCompact, sheet vs popover on isCompactTouch.',
      },
      {
        guidance: true,
        description: 'Pass serverDefault when the server knows the device.',
      },
      {guidance: false, description: 'Write your own phone media query.'},
    ],
  },
};
