// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'usePanGesture',
  displayName: 'usePanGesture',
  keywords: [
    'pan',
    'drag',
    'gesture',
    'touch',
    'swipe',
    'translation',
    'velocity',
    'pointer',
    'createPanGesture',
    'uikit',
  ],
  params: [
    {
      name: 'ref',
      type: 'RefObject<Element | null>',
      description:
        'The element to drag. The hook creates one pan for the element behind the ref, creates a new one when the ref moves to another node or `axis` changes, and destroys it at unmount; a drag in progress then ends without a `cancelled` event, since an effect never calls `onPan`.',
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
        'Limits the drag to one axis. A drag along the other axis is not reported, and that component of every value reads 0. Omit it to report both axes.',
      required: false,
    },
    {
      name: 'options.onPan',
      type: '(event: PanGestureEvent) => void',
      description:
        "Called with `{state, translation, velocity}` as the drag begins, changes, ends at the release, or is cancelled. `state` is 'began', 'changed', 'ended' or 'cancelled'. `translation` is the movement since the drag began, in pixels: the travel the drag needed to begin is not part of it, so an element that follows it does not jump. `velocity` is in pixels per second; at 'ended' it is the release velocity (0 when the finger rested before lifting), and at 'cancelled' it is 0. Read through a ref: a new function each render re-creates nothing.",
      required: true,
    },
  ],
  returns: [
    {
      name: 'void',
      type: 'void',
      description:
        'Nothing: the hook hands out no recognizer. Without React, `createPanGesture(element, options)` takes the same options and returns `{destroy}`, which removes every listener it added and cancels a drag in progress.',
    },
  ],
  usage: {
    description:
      'Reports a drag on an element as values, for a surface the product moves itself: a card that follows the finger, a drawer pulled by its handle. A finger, a mouse and a pen all drive it. The drag claims its touch at UIKit’s 10 pt, as `UIPanGestureRecognizer` does, so a tap stays a tap, and a press or a long press is never reported as a pan. With `axis`, a scroll across that axis that starts on the element stays the page’s; without it, the pan takes a drag in any direction, so a scroll that starts on the element moves the element instead of the page. The hook is a thin layer over `createPanGesture`, the same API for code without React. A drag has no keyboard or assistive-technology path of its own: whatever the drag does needs another way to do it, such as buttons or arrow keys (WCAG 2.5.7). The pan moves nothing itself, so Reduce Motion applies to the motion you drive from it: honor the user’s reduced-motion setting in the animation that moves the element. Where a component already offers the behavior, use its prop instead: BottomSheet’s `snapPoints`, Carousel’s `hasSnap`.',
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
          'Give every drag another way to do the same thing from a keyboard and from assistive technology, such as buttons, arrow keys or a menu.',
      },
      {
        guidance: true,
        description:
          "Use a component's own prop when it covers the job: BottomSheet's `snapPoints` for a sheet, Carousel's `hasSnap` for paging.",
      },
      {
        guidance: false,
        description:
          'Set a new React state on every `changed` event; write the element’s style in `onPan` instead, so a drag costs no render.',
      },
      {
        guidance: false,
        description:
          'Recognize taps or long presses with it; `useLongPress` and the components’ own press handling own those.',
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
  relatedComponents: ['BottomSheet', 'Carousel'],
  relatedHooks: ['useLongPress', 'createPanGesture'],
  importPath: '@astryxdesign/core/hooks',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Reports a drag as values ({state, translation, velocity}) for a surface you move yourself; a finger, a mouse and a pen all drive it. Claims at UIKit’s 10 pt; taps, presses and long presses are never a pan, and with axis a scroll across it stays the page’s. Thin layer over createPanGesture(element, options) → {destroy}. No keyboard path of its own: give the drag another way (WCAG 2.5.7). Reduce Motion: honor it in the animation you drive. Prefer BottomSheet snapPoints / Carousel hasSnap when they fit.',
  paramDescriptions: {
    ref: 'element to drag; one pan per node, re-created when the ref moves, destroyed at unmount.',
    options: 'config object.',
    'options.axis':
      "'x' | 'y': limit to one axis; the other is never reported and reads 0.",
    'options.onPan':
      "({state, translation, velocity}): state 'began' | 'changed' | 'ended' | 'cancelled'; translation px since the drag began (threshold travel excluded, no jump); velocity px/s, release velocity at 'ended', 0 at 'cancelled'. Read through a ref.",
  },
  returnDescriptions: {
    void: 'nothing (no recognizer). createPanGesture returns {destroy}: removes every listener, cancels a drag in progress.',
  },
  usage: {
    description:
      'Drag as values for a card, a drawer handle, any surface you move. Thin layer over createPanGesture. No keyboard path of its own (WCAG 2.5.7); Reduce Motion applies to what you animate. Prefer component props (BottomSheet snapPoints, Carousel hasSnap).',
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
        description:
          'Give every drag a keyboard and assistive-technology alternative.',
      },
      {
        guidance: true,
        description: "Use a component's own prop when it covers the job.",
      },
      {
        guidance: false,
        description:
          'Set React state on every changed event; write the style in onPan.',
      },
      {guidance: false, description: 'Recognize taps or long presses with it.'},
    ],
  },
};
