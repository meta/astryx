// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'createPanGesture',
  displayName: 'createPanGesture',
  // A factory documented as a hook: listed with the utilities, beside its
  // hook, not as a tile in the components gallery.
  group: 'Utilities',
  keywords: [
    'pan',
    'drag',
    'gesture',
    'touch',
    'swipe',
    'translation',
    'velocity',
    'pointer',
    'vanilla',
    'factory',
  ],
  params: [
    {
      name: 'element',
      type: 'Element',
      description:
        'The element to drag. The pan writes the `touch-action` its axis needs on it and nothing else; it moves nothing itself.',
      required: true,
    },
    {
      name: 'options',
      type: 'PanGestureOptions',
      description: 'Configuration object.',
      required: true,
    },
    {
      name: 'options.axis',
      type: "'x' | 'y'",
      description:
        'Limits the drag to one axis. A drag along the other axis is not reported, and that component of every value reads 0, so a scroll across it stays the page’s. Omit it to report both axes; a scroll that starts on the element then moves the element instead of the page.',
      required: false,
    },
    {
      name: 'options.onPan',
      type: '(event: PanGestureEvent) => void',
      description:
        "Called with `{state, translation, velocity}` as the drag begins, changes, ends at the release, or is cancelled. `state` is 'began', 'changed', 'ended' or 'cancelled'. `translation` is the movement since the drag began, in pixels, without the travel the drag needed to begin, so an element that follows it does not jump. `velocity` is in pixels per second; at 'ended' it is the release velocity, 0 when the finger rested before lifting, and at 'cancelled' it is 0.",
      required: true,
    },
  ],
  returns: [
    {
      name: 'destroy',
      type: '() => void',
      description:
        'Removes every listener the pan added and its `touch-action`. A drag in progress is cancelled: `onPan` hears `cancelled`.',
    },
  ],
  usage: {
    description:
      "Reports a drag on an element as values, without React, for a surface the product moves itself: a card that follows the finger, a drawer pulled by its handle. A finger, a mouse and a pen all drive it. The drag claims its touch at UIKit’s 10 pt, as `UIPanGestureRecognizer` does, so a tap stays a tap and a press or a long press is never reported as a pan. Use the `usePanGesture` hook in React. Where a component already offers the behavior, use its prop instead: BottomSheet's `snapPoints`, Carousel's `hasSnap`.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Move the element from `translation` added to where it was when the drag began, so it moves with the finger from the moment the drag claims it.',
      },
      {
        guidance: true,
        description:
          'At `ended`, hand `velocity` to the animation that settles the element, so a flick carries on at the speed it was released.',
      },
      {
        guidance: true,
        description:
          'Call `destroy` when the element leaves the page, so no listener outlives it.',
      },
      {
        guidance: false,
        description:
          'Read the element’s layout on every `changed` event to place it; `translation` already says where the finger is.',
      },
    ],
    accessibility: [
      {
        name: 'Keyboard and assistive technology',
        category: 'Keyboard',
        criterion: '2.5.7 Dragging Movements',
        description:
          'A drag has no keyboard or assistive-technology path of its own: whatever the drag does needs another way to do it, such as buttons, arrow keys or a menu.',
      },
      {
        name: 'Reduce Motion',
        category: 'Content',
        criterion: '2.3.3 Animation from Interactions',
        description:
          'The pan moves nothing itself, so Reduce Motion applies to the motion you drive from it: a settle or a throw goes to its end without travel when the person asks for reduced motion.',
      },
    ],
  },
  relatedHooks: ['usePanGesture'],
  importPath: '@astryxdesign/core',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Reports a drag on an element as values ({state, translation, velocity}), without React; a finger, a mouse and a pen all drive it. Returns {destroy}.',
  paramDescriptions: {
    element: 'element to drag; the pan writes only its touch-action.',
    options: 'config object.',
    'options.axis':
      "'x' | 'y': limit to one axis; the other is never reported and reads 0.",
    'options.onPan':
      "({state, translation, velocity}): state 'began' | 'changed' | 'ended' | 'cancelled'; translation px since the drag began (no jump); velocity px/s, release velocity at 'ended', 0 at 'cancelled'.",
  },
  returnDescriptions: {
    destroy:
      '() => void; removes every listener and the touch-action, cancels a drag in progress.',
  },
  usage: {
    description:
      'Drag as values without React, for a surface you move. Claims at UIKit’s 10 pt. No keyboard path of its own (WCAG 2.5.7); Reduce Motion applies to what you animate. Prefer component props (BottomSheet snapPoints, Carousel hasSnap); in React, usePanGesture.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Move from translation + the offset at began, so the element moves with the finger from the claim.',
      },
      {
        guidance: true,
        description: 'Hand the ended velocity to the settling animation.',
      },
      {
        guidance: true,
        description: 'Call destroy when the element leaves the page.',
      },
      {
        guidance: false,
        description: 'Read layout on every changed event; use translation.',
      },
    ],
  },
};
