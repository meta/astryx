// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').HookDoc} */
export const docs = {
  name: 'useOverlay',
  displayName: 'useOverlay',
  group: 'Overlay',
  keywords: [
    'overlay',
    'scrim',
    'hover reveal',
    'focus-within',
    'quick view',
    'card actions',
    'media overlay',
  ],
  params: [
    {
      name: 'options',
      type: 'UseOverlayOptions',
      description: 'Overlay configuration. Every field is optional.',
      required: false,
    },
    {
      name: 'options.content',
      type: 'ReactNode',
      description:
        'Content to render inside the scrim. When set, the hook returns it pre-rendered as element.',
      required: false,
    },
    {
      name: 'options.showOn',
      type: "'hover' | 'always' | 'focus' | 'hover-or-focus'",
      description:
        "Visibility trigger, read with CSS from the container. 'hover' also reveals on focus within the container for keyboard users; 'hover-or-focus' is an alias for it. On a touch device (hover: none), a hover overlay toggles on a tap on the container instead.",
      default: "'always'",
      required: false,
    },
    {
      name: 'options.isOpen',
      type: 'boolean',
      description:
        'Controlled visibility. When set, it takes precedence over showOn and the touch toggle.',
      required: false,
    },
    {
      name: 'options.scrim',
      type: "'dark' | 'light' | false",
      description:
        'Scrim background. false renders the content with no scrim background.',
      default: "'dark'",
      required: false,
    },
    {
      name: 'options.position',
      type: "'fill' | 'bottom' | 'top'",
      description:
        'Where the scrim sits: over the whole positioned area, or as a strip along its bottom or top edge.',
      default: "'fill'",
      required: false,
    },
    {
      name: 'options.align',
      type: "'start' | 'center' | 'end'",
      description: 'Alignment of the content within the scrim.',
      default: "'end'",
      required: false,
    },
  ],
  returns: [
    {
      name: 'containerRef',
      type: 'RefObject<HTMLElement | null>',
      description: 'Attach to the container element.',
    },
    {
      name: 'containerProps',
      type: 'OverlayContainerProps',
      description:
        'Spread on the same container: className and style mark it as the overlay scope (positioned, clipped), and on a touch device with a hover overlay onClick and onMouseUp toggle it on a tap.',
    },
    {
      name: 'element',
      type: 'ReactElement | null',
      description:
        'The scrim with options.content, ready to render once inside the container. null when content is not set.',
    },
    {
      name: 'renderOverlay',
      type: '(children: ReactNode) => ReactElement',
      description:
        'Renders the scrim around the children you pass, for content that changes or a scrim you mount yourself. Use it or element, not both.',
    },
  ],
  usage: {
    description:
      "Adds overlay behavior to a container you already render, such as a Card or a custom media frame, without the wrapper Overlay adds. Spread containerRef and containerProps on the container, then render element (or renderOverlay(children)) once inside it. The scrim is absolutely positioned, so it covers the nearest positioned ancestor: the container itself, or a positioned section inside it such as an image area. Visibility is CSS-driven from the container's :hover and :focus-within, so with showOn 'hover' a keyboard user reveals the content by moving focus into the container. Hidden content is not focusable, so the container needs a focusable element before the overlay content in tab order. A revealed scrim takes pointer input over the area it covers, so put that element outside the scrim, or use a top or bottom strip and keep it in the part the strip leaves uncovered.",
    bestPractices: [
      {
        guidance: true,
        description:
          "Use showOn 'hover' for actions on media cards: it also reveals on keyboard focus within the container.",
      },
      {
        guidance: true,
        description:
          'Put a focusable element (a link or the card title) before the overlay content in the container, so Tab reveals the content and the next Tab reaches it.',
      },
      {
        guidance: true,
        description:
          'Use the Overlay component when you do not already have a container element to attach to.',
      },
      {
        guidance: false,
        description:
          'Put the only way to reach an action behind hover with nothing focusable before it; keyboard users cannot focus content that is hidden.',
      },
    ],
  },
  relatedComponents: ['Overlay', 'Card', 'AspectRatio'],
  relatedHooks: ['useClickableContainer'],
  importPath: '@astryxdesign/core/Overlay',
  category: 'interaction',
};

/** @type {import('@astryxdesign/cli/authoring').HookTranslationDoc} */
export const docsDense = {
  description:
    "Overlay behavior on a container you already render (Card, media frame) w/o Overlay's wrapper. Spread containerRef + containerProps on it, render element / renderOverlay(children) once inside. CSS-driven via container :hover/:focus-within; hover mode also reveals on keyboard focus. Hidden content is not focusable, so put a focusable element before it, outside the area a revealed scrim covers (the scrim takes pointer input).",
  paramDescriptions: {
    options: 'overlay config; all fields optional.',
    'options.content':
      'content inside the scrim; returned pre-rendered as element.',
    'options.showOn':
      "CSS visibility trigger. 'hover' also reveals on focus-within; 'hover-or-focus' = alias. Touch (hover: none): hover overlays toggle on tap.",
    'options.isOpen': 'controlled visibility; wins over showOn + touch toggle.',
    'options.scrim': 'scrim background; false = no background.',
    'options.position': "scrim placement: 'fill', or a 'bottom' / 'top' strip.",
    'options.align': 'content alignment in the scrim.',
  },
  returnDescriptions: {
    containerRef: 'attach to the container.',
    containerProps:
      'spread on the container: overlay scope className/style (positioned, clipped) + tap toggle handlers for hover overlays on touch devices.',
    element:
      'scrim with content, render once inside the container; null w/o content.',
    renderOverlay:
      '(children) => scrim; for dynamic content or self-mounted scrim. Use it or element.',
  },
  usage: {
    description:
      'Overlay behavior on an existing container: spread containerRef + containerProps, render element once inside. Scrim covers nearest positioned ancestor. CSS :hover/:focus-within; hover mode reveals on keyboard focus too. Put a focusable element before hidden content.',
    bestPractices: [
      {
        guidance: true,
        description:
          "showOn 'hover' for media card actions; also reveals on keyboard focus.",
      },
      {
        guidance: true,
        description:
          'Put a focusable element before the overlay content so Tab reveals it, next Tab reaches it.',
      },
      {
        guidance: true,
        description: 'Use Overlay when there is no container to attach to.',
      },
      {
        guidance: false,
        description:
          'Hide the only route to an action behind hover with nothing focusable before it.',
      },
    ],
  },
};
