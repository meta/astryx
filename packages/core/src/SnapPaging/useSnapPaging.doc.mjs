// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useSnapPaging',
  displayName: 'useSnapPaging',
  group: 'Carousel',
  keywords: ['carousel', 'paging', 'snap', 'swipe', 'flick', 'onboarding'],
  params: [
    {
      name: 'options',
      type: "{pages?: 'view' | 'item'}",
      description:
        "What one flick moves. 'view' moves one view and lands on the item start edge nearest one viewport on; 'item' moves one item. A new value applies from the next flick.",
      default: "{pages: 'view'}",
    },
  ],
  returns: [
    {
      name: 'paging',
      type: 'SnapPaging',
      description:
        "Snap paging for Carousel's hasSnap. The value is the same for the component's life, and Carousel keeps the value it first attached.",
    },
  ],
  usage: {
    description:
      "Gives a Carousel iOS paging on native snap's stops: pass the value as hasSnap={useSnapPaging()}. Under a finger and on a trackpad swipe, a flick moves one view, or one item with {pages: 'item'}, and the row rests on an item's start edge. A mouse wheel keeps native snapping. Only a carousel given the value loads the paging code.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use it for a row read one view at a time, such as onboarding screens or a photo strip, where a fast flick must not skip past the next view.',
      },
      {
        guidance: true,
        description:
          "Pass {pages: 'item'} when several items show at once and each flick should move only one of them.",
      },
      {
        guidance: false,
        description:
          'Use it for a row people scan quickly; plain hasSnap keeps native momentum, which can pass several items in one swipe.',
      },
    ],
  },
  relatedComponents: ['Carousel'],
  relatedHooks: [],
  importPath: '@astryxdesign/core/SnapPaging',
  category: 'motion & gestures',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "iOS paging for Carousel on native snap's stops: hasSnap={useSnapPaging()}. Finger or trackpad swipe: one view per flick ({pages: 'item'}: one item); mouse wheel keeps native snap. Only that carousel loads the pager.",
  paramDescriptions: {
    options:
      "{pages: 'view' | 'item'}: what one flick moves. Default 'view'. A new value applies from the next flick.",
  },
  returnDescriptions: {
    paging:
      "value for Carousel's hasSnap; same for the component's life; Carousel keeps the first value it attached.",
  },
  usage: {
    description:
      "hasSnap={useSnapPaging()}: one view per flick under a finger or trackpad swipe, resting on an item start edge. {pages: 'item'}: one item. Mouse wheel stays native.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Use for rows read one view at a time (onboarding, photo strip).',
      },
      {
        guidance: true,
        description:
          "{pages: 'item'} when several items show and a flick should move one.",
      },
      {
        guidance: false,
        description:
          'Use for rows scanned quickly; plain hasSnap keeps native momentum.',
      },
    ],
  },
};
