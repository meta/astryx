// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'createDragToSnapPoints',
  displayName: 'createDragToSnapPoints',
  // A factory documented as a hook: listed with the utilities, beside its
  // hook, not as a tile in the components gallery.
  group: 'Utilities',
  keywords: [
    'drag',
    'snap',
    'snap points',
    'detents',
    'drawer',
    'flick',
    'swipe',
    'gesture',
    'vanilla',
    'factory',
  ],
  params: [
    {
      name: 'element',
      type: 'HTMLElement',
      description:
        'The element a drag moves. It moves along `axis` only, by translation, so lay it out at its resting position as usual.',
      required: true,
    },
    {
      name: 'options.axis',
      type: "'x' | 'y'",
      description: 'The axis the element moves along.',
      required: true,
    },
    {
      name: 'options.snapPoints',
      type: 'number[]',
      description:
        "Offsets in px along `axis` from the element's resting position, such as `[0, 240, 480]`, sorted before use (`onSettle` and `settleTo` count in that order); an empty list makes the drag do nothing. Unlike BottomSheet's `snapPoints`, they are not fractions of the viewport.",
      required: true,
    },
    {
      name: 'options.flickThreshold',
      type: 'number',
      description:
        "A release faster than this, in px/s, carries to the next snap point in its direction. The default is the flick speed measured for UIKit's sheet.",
      default: '1008',
      required: false,
    },
    {
      name: 'options.onSettle',
      type: '(index: number) => void',
      description:
        "Called with the snap point's index once the element settles on it, after a drag or `settleTo`. A settle that a new drag interrupts calls nothing.",
      required: true,
    },
  ],
  returns: [
    {
      name: 'settleTo',
      type: '(index: number) => void',
      description:
        'Settles the element on the snap point at `index` without a drag, then calls `onSettle`. Wire it to keys and buttons: it is the keyboard path. An index outside the snap points does nothing and warns in development.',
    },
    {
      name: 'destroy',
      type: '() => void',
      description:
        'Removes every listener and stops the element where it is. Call it when you remove the element.',
    },
  ],
  usage: {
    description:
      "Lets a drag move an element along one axis and settles it on snap points when the finger lifts, the way an iOS sheet settles on its detents: on the nearest snap point to where it is, on the next one in its direction after a quick flick, and back where it started when the finger was moving back. The settle continues the release's velocity. For a bottom sheet, use BottomSheet's `snapPoints`; for a scrolling row, Carousel's `hasSnap`. Use the `useDragToSnapPoints` hook in React.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Offer the same positions without a drag: buttons or keys that call `settleTo`.',
      },
      {
        guidance: true,
        description:
          'Keep the snap points few and far apart, so a release clearly picks one.',
      },
      {
        guidance: false,
        description:
          'Use it for a sheet or a carousel: their own props already settle the way people expect.',
      },
    ],
    accessibility: [
      {
        name: 'Keyboard and assistive technology',
        category: 'Keyboard',
        description:
          'A drag is one way in, never the only one. Give each snap point a control a keyboard and a screen reader can reach, such as Expand and Collapse buttons, and call `settleTo` from it. When a position changes what the element shows, announce the change.',
      },
      {
        name: 'Reduce Motion',
        category: 'Content',
        criterion: '2.3.3 Animation from Interactions',
        description:
          'When the person asks for reduced motion, the settle after a touch drag becomes a short cross-fade into the snap point, as does any settle on a device whose primary pointer is coarse, such as a tablet; after a mouse or pen drag elsewhere it lands at once. `settleTo` fades on such a device and lands at once with a fine primary pointer. While the finger is down, the element still follows it.',
      },
    ],
  },
  relatedComponents: ['BottomSheet', 'Carousel'],
  relatedHooks: ['useDragToSnapPoints', 'createPanGesture', 'createAnimator'],
  importPath: '@astryxdesign/core',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'A drag that settles an element on snap points (px offsets) at the release, without React.',
  paramDescriptions: {
    element: 'The element a drag moves.',
    'options.axis': "'x' or 'y'.",
    'options.snapPoints': 'Ascending px offsets from the resting position.',
    'options.flickThreshold':
      'px/s past which a release carries one snap point; 1008.',
    'options.onSettle': '(index) once settled.',
  },
  returnDescriptions: {
    settleTo: '(index) settles without a drag: the keyboard path.',
    destroy: '() removes every listener.',
  },
  usage: {
    description:
      'Nearest snap point, the next on a flick, the start when moving back; the settle keeps the release velocity. Sheets and carousels: use their props.',
    bestPractices: [
      {guidance: true, description: 'Wire settleTo to buttons and keys.'},
      {guidance: false, description: 'Rebuild a sheet or carousel with it.'},
    ],
  },
};
