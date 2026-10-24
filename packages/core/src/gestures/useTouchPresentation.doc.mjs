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
      type: "{isTouch?: boolean; isCompact?: boolean; idiom?: 'ios' | 'default'}",
      description:
        "What to render before hydration, where no media query can be read (for example from a user-agent hint). `isTouch` and `isCompact` default to false, `idiom` to 'default'.",
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
        "The viewport is compact: narrower than 744px or shorter than 500px, the closest a size gets to UIKit's compact size class. Key layout on it.",
    },
    {
      name: 'isCompactTouch',
      type: 'boolean',
      description:
        'Both, for presentations that need both, such as a bottom sheet in place of a popover.',
    },
    {
      name: 'idiom',
      type: "'ios' | 'default'",
      description:
        '`ios` for WebKit on iOS or iPadOS (the engine that supports `-webkit-touch-callout`) under a coarse pointer; `default` otherwise, Android included. It follows pointer changes live. Gate iOS-only looks and motion on it; `useTouchIdiom()` reads it alone, and `IOS_TOUCH_STYLE_KEYS` are the same gate as nested StyleX keys.',
    },
  ],
  usage: {
    description:
      'Experimental: this hook may change or be removed in a patch release. The one answer to "is this a touch presentation?" that Astryx\'s adaptive components share, so a menu, a selector and a sheet never disagree on one device. It is SSR-safe: it renders the server default, then updates after hydration and when the conditions change (a window resized, a mouse attached). An iPad mini in portrait is not compact and keeps anchored popovers; a phone in landscape is compact. `readTouchPresentation()` reads the same answer once, for a decision taken at one moment, such as how a menu presents as it opens. For styles, write the same queries as media keys (`@media (pointer: coarse)`), so the first paint is already right.',
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
        guidance: true,
        description:
          "Gate iOS-only looks and motion on idiom === 'ios', or in styles on the two nested keys of IOS_TOUCH_STYLE_KEYS (the media query outside, the supports query inside), never on the coarse pointer alone.",
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
    'Experimental (may change or be removed in a patch release). Shared touch-presentation answer: isTouch (coarse pointer), isCompact (width < 744px or height < 500px), isCompactTouch (both), idiom (ios: iOS WebKit + coarse pointer; else default). SSR-safe; readTouchPresentation() for one-moment decisions.',
  paramDescriptions: {
    serverDefault:
      "pre-hydration answer {isTouch?, isCompact?, idiom?}; false, false, 'default'.",
  },
  returnDescriptions: {
    isTouch: '(pointer: coarse): key touch behaviors on it.',
    isCompact: 'width < 744px or height < 500px: key layout on it.',
    isCompactTouch: 'both: sheet in place of popover.',
    idiom:
      "'ios' (iOS WebKit, coarse pointer) or 'default' (Android included): gate iOS-only looks and motion on it.",
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
      {
        guidance: true,
        description:
          "iOS-only looks and motion on idiom === 'ios' or IOS_TOUCH_STYLE_KEYS, never the coarse pointer alone.",
      },
      {guidance: false, description: 'Write your own phone media query.'},
    ],
  },
};
