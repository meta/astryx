// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useAnnounce',
  displayName: 'useAnnounce',
  keywords: [
    'announce',
    'live region',
    'aria-live',
    'screen reader',
    'accessibility',
    'a11y',
    'status',
    'alert',
    'polite',
    'assertive',
    'visually hidden',
    'wcag',
  ],
  params: [],
  returns: [
    {
      name: 'announce',
      type: '(message: string, politeness?: "polite" | "assertive") => void',
      description:
        'Speaks a message through the shared live region. Politeness defaults to "polite"; messages announced in the same frame are joined, in order, into one announcement, and an identical repeat is kept once. An empty message clears any lingering status, including joined messages not yet spoken, instead of announcing.',
    },
  ],
  usage: {
    description:
      'Imperatively announces a message to screen readers through a visually-hidden live region. Use it for state that is only conveyed visually; search result counts, "no results", loading and saved confirmations, validation errors (WCAG 4.1.3 Status Messages). The polite and assertive regions are created empty on first use and stay mounted, which is what makes announcements reliable: most screen readers ignore a live region that is inserted together with its content. Each message is cleared a couple of seconds after it is announced so stale status does not linger in the accessibility tree.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Reach for this instead of hand-rolling an aria-live div; a region rendered with its content usually does not announce at all.',
      },
      {
        guidance: true,
        description:
          'Keep "polite" for status and result counts; reserve "assertive" for errors and time-sensitive alerts, since it interrupts whatever the screen reader is saying.',
      },
      {
        guidance: true,
        description:
          'Announce the outcome, not the interaction; "12 results" rather than "search ran".',
      },
      {
        guidance: false,
        description:
          'Announce content that is already visible and correctly labeled in the DOM; that doubles up for screen reader users.',
      },
    ],
  },
  relatedComponents: ['VisuallyHidden', 'Toast'],
  relatedHooks: ['useClipboard'],
  importPath: '@astryxdesign/core/hooks',
  category: 'accessibility',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Imperative screen-reader announcements via a visually-hidden live region. Polite + assertive regions created empty on first use + kept mounted, so announcements are reliable (most AT ignore a live region inserted together w/ its content). Messages auto-clear after ~2s.',
  returnDescriptions: {
    announce:
      'speaks message through shared live region. politeness defaults "polite"; same-frame messages join in order, identical repeat kept once; empty message clears lingering + not-yet-spoken status.',
  },
  usage: {
    description:
      'Announces visual-only state to screen readers: result counts, "no results", loading / saved confirmations, validation errors (WCAG 4.1.3). Regions mounted empty up front, so updates announce; text auto-clears so stale status does not linger in a11y tree.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use instead of hand-rolled aria-live div; region rendered w/ its content usually does not announce.',
      },
      {
        guidance: true,
        description:
          '"polite" for status / counts; "assertive" only for errors + time-sensitive alerts (it interrupts).',
      },
      {
        guidance: true,
        description:
          'Announce outcome, not interaction; "12 results", not "search ran".',
      },
      {
        guidance: false,
        description:
          'Announce content already visible + labeled in DOM; doubles up for AT users.',
      },
    ],
  },
};
