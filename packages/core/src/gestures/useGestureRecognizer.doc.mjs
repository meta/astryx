// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useGestureRecognizer',
  displayName: 'useGestureRecognizer',
  stability: 'experimental',
  keywords: [
    'gesture',
    'recognizer',
    'touch',
    'pan',
    'drag',
    'swipe',
    'pinch',
    'rotation',
    'long press',
    'tap',
    'UIKit',
    'UIGestureRecognizer',
    'touch-action',
    'pointer',
  ],
  params: [
    {
      name: 'ref',
      type: 'RefObject<Element | null>',
      description:
        'The element the recognizer watches. Touches that start on it or on its descendants reach the recognizer.',
      required: true,
    },
    {
      name: 'create',
      type: '() => R',
      description:
        'Creates the recognizer, once for the life of the component (for example `() => new PanGestureRecognizer({direction: "vertical"})`). Set up relationships such as `requireToFail` and `recognizeSimultaneouslyWith` here or right after, since the instance never changes.',
      required: true,
    },
    {
      name: 'onGesture',
      type: '(recognizer: R) => void',
      description:
        'Called on began, changed, ended and cancelled, inside the input event. Read the recognizer (`state`, `translation()`, `velocity()`, `scale`, …) and write to the DOM directly; no React render happens per move. A new function each render re-attaches nothing.',
      required: false,
    },
    {
      name: 'options.isEnabled',
      type: 'boolean',
      description:
        'Live toggle. Turning it off during a gesture cancels the gesture.',
      default: 'true',
      required: false,
    },
    {
      name: 'options.manageStyle',
      type: 'boolean',
      description:
        "Lets the gesture system set the element's `touch-action` (and, for a long press, the iOS callout and text selection) from its recognizers. Turn it off only when the element's styles already say what the browser may do.",
      default: 'true',
      required: false,
    },
  ],
  returns: [
    {
      name: 'recognizer',
      type: 'R',
      description:
        'The recognizer instance, stable across renders. Use it to relate recognizers to each other or to read its state outside the listener.',
    },
  ],
  usage: {
    description:
      "Experimental: this hook may change or be removed in a patch release. Attaches a gesture recognizer with UIKit semantics to an element. Recognizers on the same touch arbitrate like UIKit: one wins unless you allow simultaneous recognition, `requireToFail` makes one wait for another, and a recognizer that takes a touch cancels the press and swallows the click underneath it. The element gets the `touch-action` its recognizers need before the first touch can land (pinch-zoom stays available unless a pinch or rotation recognizer is attached), and a claimed touch never scrolls the page. Thresholds and readings (the pan's 10 pt hysteresis, `velocity()`, a long press at 0.5 s) follow measurements of UIKit on iOS.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Drive the visual change from the listener by writing styles (a transform, an opacity) on the element; keep React state for the outcome only, such as dismissed or the snapped detent.',
      },
      {
        guidance: true,
        description:
          'Constrain a pan with `direction` (for example vertical for a sheet) so the browser keeps scrolling the other axis.',
      },
      {
        guidance: true,
        description:
          'Use `requireToFail` for a single tap that must wait for a double tap, as UIKit does.',
      },
      {
        guidance: false,
        description:
          'Call setState on every changed callback; it renders on every move and drops frames.',
      },
      {
        guidance: false,
        description:
          'Set `touch-action: none` on the element by hand; it disables pinch-zoom and fights the derived value.',
      },
    ],
  },
  relatedHooks: ['usePressTracker', 'useTouchPresentation'],
  importPath: '@astryxdesign/core/gestures/experimental',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Experimental (may change or be removed in a patch release). Attach a UIKit-style gesture recognizer to an element: UIKit arbitration (exclusive by default, requireToFail, opt-in simultaneity), derived touch-action (pinch-zoom kept), claimed touches never scroll, no render per move.',
  paramDescriptions: {
    ref: 'element watched; touches starting on it or descendants reach the recognizer.',
    create:
      'creates the recognizer once; set up requireToFail/simultaneity here.',
    onGesture:
      'began/changed/ended/cancelled, inside the input event; write to the DOM, no render per move.',
    'options.isEnabled': 'live toggle; off mid-gesture cancels it.',
    'options.manageStyle':
      'let the system set touch-action (and long-press callout) from the recognizers.',
  },
  returnDescriptions: {
    recognizer: 'stable instance across renders.',
  },
  usage: {
    description:
      'Experimental. UIKit gesture recognizer on an element: arbitration like UIKit, touch-action derived before the first touch, a claimed touch never scrolls or clicks, UIKit-measured thresholds and velocity.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Write styles from the listener; keep React state for outcomes.',
      },
      {
        guidance: true,
        description:
          'Constrain a pan with direction so the browser keeps the other axis.',
      },
      {
        guidance: true,
        description: 'requireToFail for a single tap waiting on a double tap.',
      },
      {guidance: false, description: 'setState on every changed callback.'},
      {
        guidance: false,
        description: 'Hand-set touch-action: none (kills pinch-zoom).',
      },
    ],
  },
};
