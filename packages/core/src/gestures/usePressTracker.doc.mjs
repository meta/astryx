// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'usePressTracker',
  displayName: 'usePressTracker',
  stability: 'experimental',
  keywords: [
    'press',
    'pressed',
    'highlight',
    'touch',
    'UIControl',
    'touchUpInside',
    'tracking',
    'button',
    'cell',
    'row',
    'scroll',
    'tap',
  ],
  params: [
    {
      name: 'ref',
      type: 'RefObject<Element | null>',
      description: 'The control whose presses are tracked.',
      required: true,
    },
    {
      name: 'options.onHighlightChange',
      type: '(isHighlighted: boolean) => void',
      description:
        'Called when the pressed highlight should come on or go off. Paint it here (for example by setting an attribute your styles read).',
      required: false,
    },
    {
      name: 'options.onControlEvent',
      type: '(event: ControlEvent, touch: GestureTouch) => void',
      description:
        "UIControl's events: touchDown, touchDragInside, touchDragOutside, touchDragEnter, touchDragExit, touchUpInside, touchUpOutside and touchCancel.",
      required: false,
    },
    {
      name: 'options.highlightDelay',
      type: "'inScrollers' | 'always' | 'never'",
      description:
        "When the highlight waits UIScrollView's content-touch delay (about 150 ms) so a flick paints nothing: inside a scroller (a control), always (a list cell), or never.",
      default: "'inScrollers'",
      required: false,
    },
    {
      name: 'options.cancelTravel',
      type: 'number',
      description:
        'Travel in px past which the press is cancelled for good, as a cell is when its scroll view takes the touch. Unset, the finger is tracked in and out of the expanded bounds.',
      required: false,
    },
    {
      name: 'options.quickTapFlash',
      type: 'number',
      description:
        'How long a tap quicker than the delay shows the highlight at the lift, in ms; 0 goes straight into the release.',
      default: '100',
      required: false,
    },
    {
      name: 'options.trackingExpansion',
      type: 'number',
      description:
        'How far outside the bounds the finger still counts as inside, in px (UIControl uses 70 pt).',
      default: '70',
      required: false,
    },
    {
      name: 'options.vetoesAncestorRecognizer',
      type: '(recognizer: GestureRecognizer) => boolean',
      description:
        "Which ancestor recognizers the control's own action beats. By default, an ancestor's single-finger single tap (UIKit's rule for controls); a slider would also veto a pan along its track.",
      required: false,
    },
    {
      name: 'options.isEnabled',
      type: '() => boolean',
      description: 'Read at touch-down; a disabled control tracks nothing.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'tracker',
      type: 'PressTracker',
      description:
        'The tracker, stable across renders. `isHighlighted`, `isTracking` and `isTouchInside` describe the current press.',
    },
  ],
  usage: {
    description:
      "Experimental: this hook may change or be removed in a patch release. Tracks presses on a control with UIControl's rules: the highlight comes on in the same frame (or after the content-touch delay inside a scroller), the finger stays inside up to 70 pt beyond the bounds, dragging out and back in turns the highlight off and on, and a recognizer or the browser taking the touch cancels the press with no release. Activation stays the browser's click; the press tracker only drives the highlight and the control events. `PRESS_PROFILES.control` and `PRESS_PROFILES.cell` carry UIKit's two profiles (a button's and a list cell's) as options to spread.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep activation on the click (or onPress of an Astryx control); use touchUpInside only for feedback such as a haptic.',
      },
      {
        guidance: true,
        description:
          'Spread `PRESS_PROFILES.cell` for list rows so flicks and scrolls never light a row.',
      },
      {
        guidance: false,
        description:
          'Track presses with pointerdown/pointerup and a boolean state; it un-presses the moment the finger slides off and lights up during flicks.',
      },
    ],
  },
  relatedHooks: ['useGestureRecognizer'],
  importPath: '@astryxdesign/core/gestures/experimental',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    'Experimental (may change or be removed in a patch release). UIControl press tracking: same-frame highlight (content-touch delay in scrollers), 70 pt tracking margin, drag out/in, cancel when a recognizer or the browser takes the touch. Activation stays the click.',
  paramDescriptions: {
    ref: 'the control.',
    'options.onHighlightChange': 'paint the pressed highlight on/off.',
    'options.onControlEvent': "UIControl's touchDown/drag/up/cancel events.",
    'options.highlightDelay':
      "'inScrollers' (control), 'always' (cell) or 'never'.",
    'options.cancelTravel': 'px past which the press cancels for good (cell).',
    'options.quickTapFlash':
      'ms a quick tap shows the highlight at the lift; 0 = straight to release.',
    'options.trackingExpansion': 'px beyond the bounds still inside (70).',
    'options.vetoesAncestorRecognizer':
      "ancestor recognizers the control's action beats (default: single tap).",
    'options.isEnabled': 'read at touch-down.',
  },
  returnDescriptions: {
    tracker: 'stable PressTracker; isHighlighted/isTracking/isTouchInside.',
  },
  usage: {
    description:
      'Experimental. UIControl press tracking for highlight and control events; PRESS_PROFILES.control / .cell carry UIKit profiles.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep activation on click/onPress; touchUpInside for feedback only.',
      },
      {
        guidance: true,
        description: 'Spread PRESS_PROFILES.cell for list rows.',
      },
      {
        guidance: false,
        description: 'pointerdown/pointerup + boolean state for presses.',
      },
    ],
  },
};
