// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useScrollLock',
  displayName: 'useScrollLock',
  keywords: [
    'scroll',
    'lock',
    'modal',
    'dialog',
    'page',
    'prevent',
    'background',
    'ios',
    'safari',
    'touch',
    'scrollbar',
    'gutter',
    'layout shift',
    'reflow',
  ],
  params: [
    {
      name: 'isLocked',
      type: 'boolean',
      description: 'whether page scroll should be locked.',
      required: true,
    },
  ],
  returns: [],
  usage: {
    description:
      'Locks page scroll while active and keeps the page where it is. The page gets overflow: hidden (on the root, or on body when its own overflow is the one the viewport uses), which stops wheel, keyboard and scrollbar scrolling, and overscroll-behavior-y: none on the root and body, which turns off pull-to-refresh (Chrome on Android) while the lock holds. On touch screens a one-finger pan that would scroll the page is cancelled, because iOS Safari before 26.4 scrolls an overflow: hidden page under a finger; pans that a scroller inside the overlay can take, drags on a native range input, pinch-zoom, and one-finger drags on a pinch-zoomed page (which pan the zoomed view) still work. The scroll offset never changes, so nothing jumps when the lock starts or ends, and iOS Safari keeps its toolbar as it was. Where the hidden scrollbar takes layout space (desktop), the hook holds its gutter open with scrollbar-gutter: stable, so the page, including any position: fixed chrome, does not shift sideways.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use when opening full-screen modals or dialogs to prevent background content from scrolling.',
      },
      {
        guidance: true,
        description:
          'Pass the same boolean that controls dialog visibility (e.g., isOpen) as the isLocked parameter.',
      },
      {
        guidance: false,
        description:
          'Use for non-modal overlays like popovers or tooltips; users should be able to scroll away from those.',
      },
    ],
  },
  relatedComponents: ['Dialog'],
  relatedHooks: ['useFocusTrap'],
  importPath: '@astryxdesign/core/hooks',
  category: 'layout',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Locks page scroll while active, page stays where it is: overflow: hidden on the root, or on body when its own overflow propagates (wheel, keyboard, scrollbar) + overscroll-behavior-y: none on root and body (no pull-to-refresh while locked) + cancels 1-finger pans that would scroll the page (iOS Safari <26.4 scrolls overflow: hidden pages under a finger); overlay scrollers, range inputs, pinch-zoom + drags on a zoomed page still work. Offset never changes: no jump, iOS toolbar unchanged. Holds the hidden scrollbar's gutter open (scrollbar-gutter: stable) so the page (incl. position: fixed chrome) does not shift sideways.",
  paramDescriptions: {
    isLocked: 'whether page scroll should be locked.',
  },
  usage: {
    description:
      "Locks page scroll while active, page stays where it is: overflow: hidden on the root, or on body when its own overflow propagates (wheel, keyboard, scrollbar) + overscroll-behavior-y: none on root and body (no pull-to-refresh while locked) + cancels 1-finger pans that would scroll the page (iOS Safari <26.4 scrolls overflow: hidden pages under a finger); overlay scrollers, range inputs, pinch-zoom + drags on a zoomed page still work. Offset never changes: no jump, iOS toolbar unchanged. Holds the hidden scrollbar's gutter open (scrollbar-gutter: stable) so the page (incl. position: fixed chrome) does not shift sideways.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use when opening full-screen modals / dialogs to prevent background content from scrolling.',
      },
      {
        guidance: true,
        description:
          'Pass same boolean that controls dialog visibility (e.g. isOpen) as isLocked parameter.',
      },
      {
        guidance: false,
        description:
          'Use for non-modal overlays like popovers / tooltips; users should be able to scroll away from those.',
      },
    ],
  },
};
