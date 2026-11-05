// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'MediaTheme',
  displayName: 'Media Theme',
  group: 'Utilities',
  category: 'Utility',
  isHiddenFromOverview: true,
  keywords: [
    'theme',
    'dark-mode',
    'light-mode',
    'media',
    'inverted',
    'overlay',
    'scrim',
    'toast',
    'tooltip',
  ],
  playground: {
    defaults: {
      mode: 'auto',
      children: {
        __element: 'Section',
        props: {
          variant: 'transparent',
          padding: 4,
          style: {
            maxWidth: 360,
            backgroundColor: 'var(--color-background-inverted)',
            borderRadius: 'var(--radius-container)',
          },
        },
        children: {
          __element: 'VStack',
          props: {gap: 2},
          children: [
            {
              __element: 'Text',
              props: {type: 'body', weight: 'bold'},
              children: 'Media overlay',
            },
            {
              __element: 'Text',
              props: {type: 'supporting', color: 'secondary'},
              children: 'Text and actions adapt to the dark media surface.',
            },
            {
              __element: 'Button',
              props: {label: 'Watch now', variant: 'secondary', size: 'sm'},
            },
          ],
        },
      },
    },
  },
  usage: {
    description:
      'Provides token overrides for content rendered on inverted surfaces: media overlays, scrims, toasts, and tooltips. The base behavior flips color-scheme so all light-dark() tokens resolve to the correct side. Only a small set of tokens need explicit overrides beyond that. Themes can further customize component appearance on media surfaces via onDark/onLight in defineTheme(), with both token overrides (e.g. "--color-accent": "#90CAF9") and component overrides (e.g. ghost buttons get a border on dark surfaces).',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for any content placed over a dark background (image overlays, video scrims, dark cards) or other inverted surfaces like toasts and tooltips.',
      },
      {
        guidance: true,
        description:
          'Prefer mode="auto" when the surface color comes from a theme token. A token named "inverted" is not guaranteed to be inverted, and auto measures what was actually painted instead of trusting the name. It can even decide that a surface needs no media context at all.',
      },
      {
        guidance: true,
        description:
          'Pair with a background color: MediaTheme flips the token context but does not add a background. Set backgroundColor on the parent element.',
      },
      {
        guidance: true,
        description:
          'Themes can customize components on media surfaces via onDark.components and onLight.components in defineTheme(). For example, add a border to ghost buttons on dark surfaces.',
      },
      {
        guidance: true,
        description:
          "onDark/onLight follow the surface, not the app: a dark surface under a light app and one under a dark app resolve the same side, and light-dark() inside it does too. To branch on the app mode inside a toast, key on its themeMode state (toast: {'themeMode:dark': {...}}); other inverted surfaces do not yet reflect the app mode.",
      },
      {
        guidance: false,
        description:
          'Use MediaTheme for app-level dark mode: use Theme with mode="dark" or mode="system" instead. MediaTheme is for local surface inversions, not page-wide color scheme.',
      },
    ],
  },
  props: [
    {
      name: 'mode',
      type: "'dark' | 'light' | 'auto' | 'off'",
      required: true,
      description:
        'Surface luminance context: dark for content over dark backgrounds (light text, white-tinted interactions), light for content over light backgrounds (dark text, black-tinted interactions), auto to decide from the painted surface (no media context when the ambient text already reads on the surface at 3:1, otherwise the side that reads better), and off to turn it off explicitly. The element renders either way, so a surface can switch contexts without remounting children.',
    },
    {
      name: 'fallback',
      type: "'dark' | 'light'",
      default: "'dark'",
      description:
        'Which side auto uses when the surface cannot be measured: during SSR, on the first client frame, and whenever the backdrop is not knowable from CSS, most often a background-image, whose pixels need sampling (useImageMode) rather than a computed style. Ignored unless mode is auto.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      required: true,
      description:
        'Content to render with inverted token context. Components inherit the correct colors automatically.',
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  usage: {
    description:
      'Token overrides for content on inverted surfaces: media overlays, scrims, toasts, tooltips. Base behavior flips color-scheme so all light-dark() tokens resolve to correct side; only a small set of tokens need explicit overrides beyond that. Themes can further customize component appearance on media surfaces via onDark/onLight in defineTheme(), w/ token overrides (e.g. "--color-accent": "#90CAF9") + component overrides (e.g. ghost buttons get border on dark surfaces).',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for any content over dark background (image overlays, video scrims, dark cards) or other inverted surfaces like toasts/tooltips.',
      },
      {
        guidance: true,
        description:
          'Prefer mode="auto" when surface color comes from a theme token; a token named "inverted" is not guaranteed to be; auto measures what was painted.',
      },
      {
        guidance: true,
        description:
          'Pair w/ background color: MediaTheme flips token context but does NOT add background. Set backgroundColor on parent element.',
      },
      {
        guidance: true,
        description:
          'Themes can customize components on media surfaces via onDark.components + onLight.components in defineTheme(). E.g. add border to ghost buttons on dark surfaces.',
      },
      {
        guidance: true,
        description:
          "onDark/onLight + light-dark() follow the surface, not the app: dark surface under light app and under dark app resolve the same side. To branch on app mode inside a toast, key on its themeMode state (toast: {'themeMode:dark': {...}}); other inverted surfaces do not yet reflect app mode.",
      },
      {
        guidance: false,
        description:
          'Use MediaTheme for app-level dark mode: use Theme w/ mode="dark"/mode="system" instead. MediaTheme is for local surface inversions, not page-wide color scheme.',
      },
    ],
  },
  propDescriptions: {
    mode: 'surface luminance context: dark for content over dark backgrounds (light text, white-tinted interactions), light for content over light backgrounds (dark text, black-tinted interactions), auto to decide from painted surface (none if ambient text already reads at 3:1, else better-reading side), off to turn off explicitly (element still renders, so children never remount)',
    fallback:
      'side auto uses when surface is unmeasurable (SSR, first frame, background-image, which needs useImageMode sampling); ignored unless mode is auto',
  },
};
