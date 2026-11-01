// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'createAnimator',
  displayName: 'createAnimator',
  // A factory documented as a hook: listed with the utilities, beside its
  // hook, not as a tile in the components gallery.
  group: 'Utilities',
  keywords: [
    'animate',
    'animation',
    'animator',
    'spring',
    'decay',
    'momentum',
    'fling',
    'motion',
    'transform',
    'opacity',
    'vanilla',
    'factory',
  ],
  params: [
    {
      name: 'element',
      type: 'HTMLElement',
      description:
        'The element to animate. The animator writes its `translate`, `scale`, `rotate` and `opacity`, and while it moves an inline `will-change` for them, merged with any it already has and restored 500 ms after its last motion; nothing else, so lay it out and style it as usual. Use one animator per element: two on one element overwrite each other.',
      required: true,
    },
  ],
  returns: [
    {
      name: 'animate',
      type: '(target: {x?, y?, scale?, rotate?, opacity?}, options?: {velocity?}) => Promise<void>',
      description:
        "Springs the given channels to `target` from wherever they are on screen, on the state-change motion Astryx's components use, and resolves when they arrive (or as soon as a later call takes them over). `x` and `y` are px, `scale` is 1 at the element's size, `rotate` is degrees and `opacity` runs from 0 to 1. Pass `velocity` (units per second, such as a drag's release velocity) to start with it; without it a channel keeps the velocity it has on screen, so interrupting a motion never jumps.",
    },
    {
      name: 'decay',
      type: '(velocity: {x?, y?, scale?, rotate?, opacity?}) => Promise<void>',
      description:
        "Coasts the given channels from a release velocity in their units per second, slowing as a scroll view's momentum does, and resolves when they stop (or as soon as a later call takes any of them over); opacity stops at 0 or 1. The distance follows from the velocity: use it to fling something away, then remove or reset it.",
    },
    {
      name: 'set',
      type: '(values: {x?, y?, scale?, rotate?, opacity?}) => void',
      description:
        'Puts the given channels at these values at once, ending their motion: follow a finger with it, frame by frame.',
    },
    {
      name: 'get',
      type: '() => {x, y, scale, rotate, opacity}',
      description: "Every channel's value on screen now.",
    },
    {
      name: 'getVelocity',
      type: '() => {x, y, scale, rotate, opacity}',
      description:
        "Every channel's velocity on screen now, in units per second.",
    },
    {
      name: 'stop',
      type: '() => void',
      description: 'Halts every channel where it is on screen.',
    },
    {
      name: 'destroy',
      type: '() => void',
      description:
        'Stops every motion and lets the element go; the element keeps the values it shows. Call it when you remove the element or no longer animate it.',
    },
  ],
  usage: {
    description:
      "Animates one element with the motion Astryx's own components use, without React. `animate` springs an element to new values on the state-change motion, `decay` flings it with the momentum of a released scroll view, and `set` moves it directly, so a card can follow a finger, snap back and be thrown away. Use the `useAnimator` hook in React. To animate an area's layout as its items change, use `useAnimatedLayout`; for what a component already animates, such as a sheet's detents or a carousel's snapping, use the component's own props.",
    bestPractices: [
      {
        guidance: true,
        description:
          'Start every `animate` that follows a drag with the release velocity, so the element carries on as it was thrown.',
      },
      {
        guidance: true,
        description:
          'Reach every state an animation shows without the animation too: a key, a button or a menu item that calls the same code.',
      },
      {
        guidance: true,
        description:
          '`await` the promise before removing an element you animate out, and call `destroy` once it is gone.',
      },
      {
        guidance: false,
        description:
          'Read the element\u2019s position from layout while it moves: `get` gives the value on screen, wherever the motion runs.',
      },
    ],
    accessibility: [
      {
        name: 'Keyboard and assistive technology',
        category: 'Keyboard',
        description:
          'An animator moves an element; it adds no way to act. Give every action an animation stands for a control a keyboard and a screen reader can reach, such as a button that discards a card, and have it call `animate`, which Reduce Motion turns into a fade in place. Keep `decay` for a throw the person made: Reduce Motion keeps the momentum of a coast, as it continues that throw. Keep focus on an element that stays on screen: move it before you fling its element away.',
      },
      {
        name: 'Reduce Motion',
        category: 'Content',
        criterion: '2.3.3 Animation from Interactions',
        description:
          'When the person asks for reduced motion, every call is planned for them. On a touch screen a move or a scale becomes a short opacity cross-fade: the element fades out where it was and fades back in where it lands. With a mouse it lands at once. A decay of `x` and `y` keeps its momentum, as it continues the throw the person made; a decay of `scale`, `rotate` or `opacity` is planned like a move. No option turns this off.',
      },
    ],
  },
  relatedHooks: ['useAnimator', 'useAnimatedLayout'],
  importPath: '@astryxdesign/core',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Animates one element (x, y, scale, rotate, opacity) with Astryx's motion, without React.",
  paramDescriptions: {
    element: 'The element to animate; one animator per element.',
  },
  returnDescriptions: {
    animate:
      '(target, {velocity?}) => Promise<void>; springs on the state-change motion.',
    decay:
      '({x?, y?, scale?, rotate?, opacity?}) => Promise<void>; coasts from a release velocity.',
    set: '(values) => void; jumps, ending motion.',
    get: '() => every value on screen.',
    getVelocity: '() => every velocity on screen.',
    stop: '() => void; halts where it is.',
    destroy: '() => void; lets the element go.',
  },
  usage: {
    description:
      'Spring with animate, fling with decay, follow a finger with set. Reduce Motion: a cross-fade on touch, at once with a mouse; decay keeps its momentum.',
    bestPractices: [
      {
        guidance: true,
        description: 'Pass the release velocity to animate after a drag.',
      },
      {
        guidance: false,
        description: 'Read layout for the position mid-motion; use get.',
      },
    ],
  },
};
