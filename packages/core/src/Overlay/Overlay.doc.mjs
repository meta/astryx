// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Overlay',
  displayName: 'Overlay',
  group: 'Overlay',
  category: 'Overlay',

  keywords: ['overlay', 'scrim', 'media', 'hover', 'focus', 'image', 'card'],

  usage: {
    description:
      'Overlay layers action or supporting content over media, cards, video, or other bounded surfaces with an optional scrim and reveal behavior. Host attributes and DOM handlers (id, data-*, aria-*) reach the root element.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Use overlays for short, contextual actions or labels that belong directly to the underlying media or surface.',
      },
      {
        guidance: true,
        description:
          'Keep overlay content compact so it remains legible over the scrim and does not obscure important visual information.',
      },
      {
        guidance: false,
        description:
          'Do not use Overlay for floating content anchored outside the surface. Use Popover, Tooltip, or Dialog for those patterns.',
      },
    ],
    anatomy: [
      {
        name: 'Base content',
        required: false,
        description: 'The media, card, or bounded surface that the overlay sits on top of.',
      },
      {
        name: 'Scrim',
        required: false,
        description: 'Optional dark or light overlay background that improves content contrast.',
      },
      {
        name: 'Overlay content',
        required: true,
        description: 'Actions, labels, or supporting content rendered above the base surface.',
      },
    ],
  },

  playground: {
    defaults: {
      content: {
        __element: 'Button',
        props: {label: 'Quick view', variant: 'secondary', size: 'sm'},
      },
      children: [
        {
          __element: 'AspectRatio',
          props: {
            ratio: 1.7777777777777777,
            style: {
              width: 320,
              borderRadius: 12,
              overflow: 'clip',
            },
          },
          children: {
            __element: 'div',
            props: {
              style: {
                width: '100%',
                height: '100%',
                background:
                  'linear-gradient(135deg, #172554 0%, #2563eb 55%, #67e8f9 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                color: 'white',
                fontWeight: 600,
              },
            },
            children: 'Media preview',
          },
        },
      ],
    },
  },

  props: [
    {
      name: 'content',
      type: 'ReactNode',
      description: 'Content rendered inside the overlay scrim.',
      required: true,
      slotElements: [
        {
          __element: 'Button',
          props: {label: 'Quick view', variant: 'secondary', size: 'sm'},
        },
        {
          __element: 'Text',
          props: {type: 'body', weight: 'bold'},
          children: 'Overlay content',
        },
      ],
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Base content such as an image, video, card, or media surface that the overlay sits on top of.',
      slotElements: [
        {
          __element: 'AspectRatio',
          props: {ratio: 1.7777777777777777, style: {width: 320}},
          children: {
            __element: 'div',
            props: {
              style: {
                width: '100%',
                height: '100%',
                background:
                  'linear-gradient(135deg, #172554 0%, #2563eb 55%, #67e8f9 100%)',
              },
            },
          },
        },
      ],
    },
    {
      name: 'showOn',
      type: "'hover' | 'always' | 'focus' | 'hover-or-focus'",
      description:
        'Visibility trigger. Hover mode also reveals on focus for keyboard accessibility; hover-or-focus is an alias for hover.',
      default: "'always'",
    },
    {
      name: 'isOpen',
      type: 'boolean',
      description: 'Controlled visibility override. When set, this takes precedence over showOn and touch toggle behavior.',
    },
    {
      name: 'scrim',
      type: "'dark' | 'light' | false",
      description: 'Scrim background mode. Set to false to render overlay content without a scrim background.',
      default: "'dark'",
    },
    {
      name: 'position',
      type: "'fill' | 'bottom' | 'top'",
      description: 'Where the scrim appears within the base surface.',
      default: "'fill'",
    },
    {
      name: 'align',
      type: "'start' | 'center' | 'end'",
      description: 'Alignment of the overlay content within the scrim.',
      default: "'end'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class name(s) appended to the root element. Prefer xstyle for styling when possible.',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description: 'Inline styles applied to the root element. Prefer xstyle for design-system styling.',
    },
    {
      name: 'ref',
      type: 'Ref<HTMLDivElement>',
      description: 'Ref forwarded to the overlay root element.',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-overlay'},
      {className: 'astryx-overlay-scrim', visualProps: ['position']},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'layered content over media/card surfaces with scrim + hover/focus/controlled reveal',
  usage: {
    description:
      'Overlay layers compact actions or supporting content over media, cards, or bounded surfaces with optional dark/light scrim and hover/focus/controlled reveal. Host attributes and DOM handlers reach the root element.',
    bestPractices: [
      {guidance: true, description: 'Use for short contextual actions/labels tied to the underlying surface.'},
      {guidance: true, description: 'Keep content compact and legible over the scrim.'},
      {guidance: false, description: 'Do not use for floating anchored surfaces; use Popover, Tooltip, or Dialog.'},
    ],
  },
  propDescriptions: {
    content: 'overlay content inside scrim; required',
    children: 'base media/card/surface beneath overlay',
    showOn: 'visibility trigger; hover also focus-visible; default always',
    isOpen: 'controlled visibility override',
    scrim: 'dark/light scrim or false for no scrim; default dark',
    position: 'scrim placement: fill, bottom strip, or top strip',
    align: 'content alignment inside scrim',
    xstyle: 'StyleX layout styles; must be stylex.create() value',
    className: 'additional root class names',
    style: 'inline root styles; prefer xstyle',
    ref: 'forwarded root div ref',
  },
};
