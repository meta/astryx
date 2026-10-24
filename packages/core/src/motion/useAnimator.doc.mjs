// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useAnimator',
  displayName: 'useAnimator',
  stability: 'experimental',
  keywords: [
    'animation',
    'spring',
    'compositor',
    'motion',
    'UIKit',
    'touch',
    'gesture',
    'interruptible',
    'velocity',
    'reduced motion',
    'experimental',
  ],
  params: [
    {
      name: 'options',
      type: 'AnimatorOptions',
      description:
        'Read on the first render only: starting values (identity by default, never read from the DOM), a `pseudoElement` such as `::backdrop`, a clock, and the Reduced Motion preference.',
      required: false,
    },
  ],
  returns: [
    {
      name: 'ref',
      type: '(element: HTMLElement | null) => void',
      description:
        'Callback ref for the animated element; stable for the component\u2019s lifetime.',
    },
    {
      name: 'animator',
      type: 'Animator',
      description:
        'The animator; stable. `animate(targets, {spring, velocity})` springs to new values from the current presentation value and velocity, `play(curves)` bakes any closed-form curve, `decay(velocities, {bounds})` coasts like a scroll view, `set(values)` writes a value for direct manipulation, `stop()` freezes in place, and `get` / `getVelocity` read the curves without touching the DOM.',
    },
  ],
  usage: {
    description:
      'Experimental: this hook and everything exported from `@astryxdesign/core/motion/experimental` are outside the stable compatibility promise and may change or be removed in a patch release. A compositor animator for touch presentations: springs, scroll coasts and any closed-form curve are baked into Web Animations on the individual `translate`, `rotate`, `scale` and `opacity` properties, so motion keeps running while JavaScript is busy and never re-renders the component. A finger can catch any animation mid-flight and a new target keeps its velocity. Under `prefers-reduced-motion`, travel becomes UIKit\u2019s cross-fade. The same subpath exports `createAnimator` for non-React code, the spring, rubber-band and cubic-b\u00e9zier math, and the UIKit constants table as the read-only `uikit` namespace.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Take every spring, rate and threshold from `uikit` (for example `uikit.springs.sheetDetent`) so the motion matches UIKit and each value keeps its source.',
      },
      {
        guidance: true,
        description:
          'Hand the release velocity from the gesture to `animate` so the motion continues the finger\u2019s throw.',
      },
      {
        guidance: false,
        description:
          'Drive the same element\u2019s `translate`, `rotate`, `scale` or `opacity` from CSS transitions or other animations at the same time.',
      },
      {
        guidance: false,
        description:
          'Rely on this API from stable product code: it is experimental and may change in a patch release.',
      },
    ],
  },
  relatedHooks: ['useGestureRecognizer'],
  importPath: '@astryxdesign/core/motion/experimental',
};
