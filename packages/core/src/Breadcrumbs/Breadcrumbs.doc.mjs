// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'Breadcrumbs',
  displayName: 'Breadcrumbs',
  group: 'Breadcrumbs',
  category: 'Navigation',
  keywords: ["breadcrumbs","breadcrumb","navigation","nav","crumbs","trail","path","hierarchy","wayfinding","steps"],
  usage: {
    description:
      'Breadcrumbs show a trail of links from the root to the current page. Use them at the top of detail pages, settings panels, or anywhere the user needs to see where they are and navigate back up.',
    bestPractices: [
      {guidance: true, description: 'Place breadcrumbs above the page heading so the user sees their location before reading the content.'},
      {guidance: true, description: 'Keep labels short and match the page titles they link to: "Settings" not "Application Settings Page".'},
      {guidance: true, description: 'Use the supporting variant in dense UIs like admin panels or sidebars where the breadcrumb should be subtle.'},
      {guidance: true, description: 'Make the last item plain text, not a link; it represents the current page. The component does this automatically when you set isCurrent.'},
      {guidance: true, description: 'The component implements the WAI-ARIA APG Breadcrumb pattern: a labelled nav landmark wrapping an ordered list, with aria-current="page" on the current item. A crumb with a menu additionally implements the APG Menu Button pattern, opening on Enter, Space or ArrowDown and closing on Escape.'},
      {guidance: true, description: 'Give each trail its own label when a page renders more than one, so the nav landmarks stay distinguishable in a screen reader landmark list.'},
      {guidance: false, description: 'Use breadcrumbs as the primary navigation. They supplement a sidebar or top nav, not replace it.'},
      {guidance: false, description: 'Show breadcrumbs on top-level pages that have no parent; they add clutter without helping the user.'},
      {guidance: false, description: 'Let the trail grow beyond 5 levels. If you need more, consider simplifying the page hierarchy instead.'},
      {guidance: true, description: 'The built-in slash separator mirrors automatically in RTL. For a custom separator, leave Unicode-mirrored angle quotes such as › alone; mirror arrows and Icon separators once with rtlStyles.mirror.'},
      {guidance: false, description: 'Mirror a separator the bidi algorithm already mirrors. An angle-quote glyph such as › is Bidi_Mirrored, so it flips under RTL on its own and rtlStyles.mirror would flip it back. An arrow glyph such as → and any Icon separator are not, so those do need rtlStyles.mirror through xstyle.'},
    ],
    anatomy: [
      {name: 'Trail', required: true, description: 'The ordered list of links from root to current page.'},
      {name: 'Item', required: true, description: 'A single step in the trail. Renders as a link or plain text for the current page.'},
      {name: 'Separator', required: true, description: 'The character between items. Defaults to "/" but can be customized.'},
      {name: 'Icon', required: false, description: 'An optional icon before an item label, like a home icon on the first item.'},
    ],
  },
  theming: {
    targets: [
      {className: 'astryx-breadcrumb-item', visualProps: ['variant']},
      {
        className: 'astryx-breadcrumb-item-menu-trigger',
        visualProps: ['variant'],
      },
      {className: 'astryx-breadcrumb-menu'},
      {className: 'astryx-breadcrumbs', visualProps: ['variant']},
    ],
  },
  description: 'Navigation container that renders a <nav> with an ordered list of breadcrumb items.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'BreadcrumbItem elements to render inside the breadcrumb trail.',
      slotElements: [
        {
          __element: 'BreadcrumbItem',
          props: {
            href: '#',
          },
          children: 'Page',
        },
      ],
      required: true,
    },
    {
      name: 'separator',
      type: 'ReactNode',
      description: 'Separator rendered between breadcrumb items. The built-in slash mirrors automatically in RTL.',
      default: "'/'",
      slotElements: [
        {
          __element: 'Icon',
          props: {
            icon: 'chevronRight',
            size: 'sm',
          },
        },
      ],
    },
    {
      name: 'variant',
      type: "'default' | 'supporting'",
      description: 'Visual variant: supporting is smaller with secondary text styling.',
      default: "'default'",
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the nav landmark (aria-label).',
      default: "'Breadcrumb'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
  ],
  components: [
    {
      name: 'BreadcrumbItem',
      displayName: 'Breadcrumb Item',
      description: 'Individual breadcrumb item. Renders as a link when href is provided, or as plain text for the current page.',
      props: [
        {
          name: 'children',
          type: 'ReactNode',
          description: 'Label content for the breadcrumb item.',
          required: true,
        },
        {
          name: 'href',
          type: 'string',
          description: 'URL the breadcrumb links to; omit for non-navigable items.',
        },
        {
          name: 'onClick',
          type: '(e: MouseEvent) => void',
          description: 'Click handler for the breadcrumb item.',
        },
        {
          name: 'isCurrent',
          type: 'boolean',
          description:
            'Marks this item as the current page, applying aria-current="page". When omitted, the last item is auto-detected if no item is explicitly current; pass false to opt out.',
        },
        {
          name: 'startIcon',
          type: 'ReactNode',
          description: 'Icon rendered before the item label.',
        },
        {
          name: 'as',
          type: 'LinkComponentType',
          description: 'Custom link component to render instead of <a>. Overrides the provider-level default from LinkProvider. Only applies to non-current items.',
        },
        {
          name: 'menu',
          type: 'DropdownMenuOption[] | ReactNode',
          description:
            'Menu opened when the item is activated, using the same item API as DropdownMenu/MoreMenu/ContextMenu (a DropdownMenuOption[] array or composed DropdownMenuItem children). Renders a link-styled menu trigger with a chevron and aria-haspopup="menu". Takes precedence over href/onClick.',
        },
        {
          name: 'menuSize',
          type: "'sm' | 'md' | 'lg'",
          description:
            "Size passed to the menu items. Defaults from the breadcrumb variant ('supporting' → 'sm', otherwise 'md').",
        },
      ],
    },
  ],
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'Breadcrumbs show a trail of links from the root to the current page. Use them at the top of detail pages, settings panels, or anywhere the user needs to see where they are and navigate back up.',
    bestPractices: [
      {guidance: true, description: 'Place breadcrumbs above the page heading so the user sees their location before reading the content.'},
      {guidance: true, description: 'Keep labels short and match the page titles they link to: "Settings" not "Application Settings Page".'},
      {guidance: true, description: 'Use the supporting variant in dense UIs like admin panels or sidebars where the breadcrumb should be subtle.'},
      {guidance: true, description: 'Make the last item plain text, not a link; it represents the current page. The component does this automatically when you set isCurrent.'},
      {guidance: true, description: 'The component implements the WAI-ARIA APG Breadcrumb pattern: a labelled nav landmark wrapping an ordered list, with aria-current="page" on the current item. A crumb with a menu additionally implements the APG Menu Button pattern, opening on Enter, Space or ArrowDown and closing on Escape.'},
      {guidance: true, description: 'Give each trail its own label when a page renders more than one, so the nav landmarks stay distinguishable in a screen reader landmark list.'},
      {guidance: false, description: 'Use breadcrumbs as the primary navigation. They supplement a sidebar or top nav, not replace it.'},
      {guidance: false, description: 'Show breadcrumbs on top-level pages that have no parent; they add clutter without helping the user.'},
      {guidance: false, description: 'Let the trail grow beyond 5 levels. If you need more, consider simplifying the page hierarchy instead.'},
      {guidance: true, description: 'The built-in slash separator mirrors automatically in RTL. For a custom separator, leave Unicode-mirrored angle quotes such as › alone; mirror arrows and Icon separators once with rtlStyles.mirror.'},
      {guidance: false, description: 'Mirror a separator the bidi algorithm already mirrors. An angle-quote glyph such as › is Bidi_Mirrored, so it flips under RTL on its own and rtlStyles.mirror would flip it back. An arrow glyph such as → and any Icon separator are not, so those do need rtlStyles.mirror through xstyle.'},
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'link trail from root to current page for wayfinding',
  usage: {
    description:
      'Breadcrumbs show a trail of links from root to current page. Use at the top of detail pages, settings, or nested content.',
    bestPractices: [
      {guidance: true, description: 'Place above the page heading so user sees location before reading content.'},
      {guidance: true, description: 'Keep labels short + matching page titles they link to: "Settings" not "Application Settings Page".'},
      {guidance: true, description: 'Use supporting variant in dense UIs where the breadcrumb should be subtle.'},
      {guidance: true, description: 'Last item plain text, not a link; represents current page; done automatically when you set isCurrent.'},
      {guidance: true, description: 'Implements APG Breadcrumb: labelled nav landmark + ol + aria-current="page". A menu crumb also implements APG Menu Button (Enter/Space/ArrowDown to open, Escape to close).'},
      {guidance: true, description: 'Give each trail its own label when a page renders more than one.'},
      {guidance: false, description: 'Use as primary navigation; breadcrumbs supplement, not replace, a main nav.'},
      {guidance: false, description: 'Show on top-level pages with no parent.'},
      {guidance: false, description: 'Let the trail exceed 5 levels; simplify the hierarchy instead.'},
      {guidance: true, description: 'Built-in / mirrors automatically in RTL. Leave bidi-mirrored › alone; mirror custom arrows and Icons once.'},
      {guidance: false, description: 'Mirror a separator that already mirrors itself: › is Bidi_Mirrored and flips under RTL on its own. → and Icon separators are not, so those need rtlStyles.mirror via xstyle.'},
    ],
  },
};
