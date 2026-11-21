// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Menu',
    required: true,
    description:
      'Menu container for nav-heading actions, with menu semantics and keyboard navigation.',
  },
  {
    name: 'Item',
    required: true,
    description: 'Selectable action or navigation link inside the Menu.',
  },
  {
    name: 'Icon',
    required: false,
    description: 'Optional Icon-rendered artwork shown before an Item label.',
  },
  {
    name: 'Text-rendered item label',
    required: false,
    description: 'String Item label rendered through Text.',
  },
  {
    name: 'Caller-rendered item label',
    required: false,
    description: 'Non-string Item label content rendered directly by the caller.',
  },
  {
    name: 'Item description',
    required: false,
    description: 'Optional supporting description rendered through Text.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'NavHeadingMenu',
  displayName: 'Nav Heading Menu',
  group: 'Navigation',
  category: 'Navigation',
  isHiddenFromOverview: true,
  hidden: false,
  keywords: ['nav', 'menu', 'navigation', 'heading', 'menu-item', 'popover'],
  usage: {
    anatomy,
    description:
      'Accessible menu container and items for nav heading popovers. ' +
      'NavHeadingMenu provides role="menu" with keyboard navigation; ' +
      'NavHeadingMenuItem renders individual selectable items. ' +
      'Pass as the menu prop of SideNavHeading or TopNavHeading.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass NavHeadingMenu as the menu prop of SideNavHeading or TopNavHeading. Where the heading closes on a choice, choosing an enabled item runs its onClick or link and closes the menu.',
      },
      {
        guidance: true,
        description:
          'NavHeadingMenu follows the keyboard model of the WAI-ARIA APG Menu pattern (https://www.w3.org/WAI/ARIA/apg/patterns/menubar/): a menu of menuitem rows. ArrowDown and ArrowUp move one row and wrap, Home and End go to the first and last row, typing a character moves to the matching row, Enter or Space activates the row, and Escape closes the heading menu where the heading supplies a close action.',
      },
      {
        guidance: true,
        description:
          'Give a NavHeadingMenu used on its own an aria-label. The menu has no accessible name unless you pass one.',
      },
      {
        guidance: false,
        description:
          'Remove a destination the user cannot use right now when knowing it exists helps them. Set isDisabled instead: the row stays reachable by the arrow keys and typeahead, is announced as disabled, and does nothing when chosen.',
      },
      {
        guidance: false,
        description:
          'Put other interactive controls in the menu. The arrow keys move only between NavHeadingMenuItem rows, so another control is skipped.',
      },
    ],
  },
  playground: {
    defaults: {
      children: [
        {__element: 'NavHeadingMenuItem', props: {label: 'Dashboard', href: '#'}},
        {__element: 'NavHeadingMenuItem', props: {label: 'Analytics', href: '#'}},
        {__element: 'NavHeadingMenuItem', props: {label: 'Settings', href: '#'}},
      ],
    },
  },
  props: [
    {name: 'children', type: 'ReactNode', required: true, description: 'Menu items.'},
    {name: 'size', type: "'sm' | 'md' | 'lg'", default: "'md'", description: 'Controls min-width and item padding.'},
    {name: 'minWidth', type: 'number | string', description: 'Minimum width override. Takes precedence over the size-based minimum width.'},
    {name: 'ref', type: 'Ref<HTMLDivElement>', description: 'Ref forwarded to the menu element.'},
    {name: 'xstyle', type: 'StyleXStyles', description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.'},
  ],
  components: [
    {
      name: 'NavHeadingMenuItem',
      displayName: 'Nav Heading Menu Item',
      description:
        'One selectable row inside NavHeadingMenu. Renders as a link when href is provided, and takes its size from the menu.',
      props: [
        {
          name: 'label',
          type: 'ReactNode',
          required: true,
          description:
            'Primary label. A string renders as one line of body text; other content renders as given.',
        },
        {
          name: 'description',
          type: 'ReactNode',
          description: 'Secondary text on one line below the label.',
        },
        {
          name: 'icon',
          type: 'IconType | ReactNode',
          description: 'Icon shown before the label.',
        },
        {
          name: 'href',
          type: 'string',
          description:
            'Destination. An enabled row renders as the LinkProvider link (else an anchor) when provided, and a row without it renders as a div.',
        },
        {
          name: 'onClick',
          type: '() => void',
          description:
            'Called when an enabled row is chosen, before the heading menu closes.',
        },
        {
          name: 'isDisabled',
          type: 'boolean',
          default: 'false',
          description:
            'Makes the row unavailable: it stays focusable and reachable by the arrow keys and typeahead, carries aria-disabled, drops its href, and does not run onClick or close the menu.',
        },
        {
          name: 'ref',
          type: 'Ref<HTMLElement>',
          description: 'Ref forwarded to the row element.',
        },
        {
          name: 'xstyle',
          type: 'StyleXStyles',
          description:
            'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
        },
      ],
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-nav-heading-menu', visualProps: ['size']},
      {className: 'astryx-nav-heading-menu-item', visualProps: ['size']},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'Accessible menu container + items for nav heading popovers. NavHeadingMenu = role="menu" w/ keyboard nav; NavHeadingMenuItem renders selectable items.',
  usage: {
    anatomy,
    description:
      'Accessible menu container + items for nav heading popovers. NavHeadingMenu provides role="menu" w/ keyboard navigation; NavHeadingMenuItem renders individual selectable items. Pass as menu prop of SideNavHeading or TopNavHeading.',
  },
  propDescriptions: {
    size: 'controls min-width + item padding',
    minWidth: 'minimum width override; wins over size',
    ref: 'ref to menu element',
  },
  components: [
    {
      name: 'NavHeadingMenuItem',
      description: 'one selectable row; link when href, size from menu',
      propDescriptions: {
        label: 'primary label; string = one line of body text',
        description: 'one-line secondary text below label',
        icon: 'icon before label',
        href: 'destination; enabled row = LinkProvider link (else a), div without',
        onClick: 'called when an enabled row is chosen, before close',
        isDisabled:
          'focusable + reachable, aria-disabled, no href, no onClick, no close',
        ref: 'ref to row element',
        xstyle: 'StyleX layout styles; must be stylex.create() value',
      },
    },
  ],
};
