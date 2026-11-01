// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Trigger button',
    required: true,
    description: 'Button that opens and closes the selected menu presentation.',
  },
  {
    name: 'Trigger indicator icon',
    required: false,
    description:
      'Optional trailing chevron shown by a labeled trigger when hasChevron is enabled.',
  },
  {
    name: 'Pointer menu surface',
    required: false,
    description:
      'Anchored top-level or nested menu panel used by the pointer presentation.',
  },
  {
    name: 'Pointer action row',
    required: false,
    description:
      'Action, selectable option, or submenu trigger row in an anchored menu.',
  },
  {
    name: 'Icon-rendered item icon',
    required: false,
    description:
      'Optional semantic or component icon rendered through Icon at the start of an action row.',
  },
  {
    name: 'Caller-rendered item start content',
    required: false,
    description:
      'Optional arbitrary React content rendered directly at the start of an action row.',
  },
  {
    name: 'Checkbox indicator',
    required: false,
    description:
      'Decorative shared checkbox indicator for a checkbox action row.',
  },
  {
    name: 'Radio indicator',
    required: false,
    description:
      'Decorative shared radio indicator with an additional menu-owned target.',
  },
  {
    name: 'Pointer section heading',
    required: false,
    description:
      'Heading that labels a group of rows in an anchored menu: a data-driven section or a compound DropdownMenuGroup.',
  },
  {
    name: 'Pointer divider',
    required: false,
    description: 'Divider between groups in an anchored menu.',
  },
  {
    name: 'Pointer submenu indicator icon',
    required: false,
    description:
      'Trailing chevron that identifies an action row as a nested flyout trigger.',
  },
  {
    name: 'Touch sheet frame',
    required: false,
    description:
      'BottomSheet panel, content area, handle, and optional scrim that host touch actions.',
  },
  {
    name: 'Touch menu surface',
    required: false,
    description:
      'Menu-owned content panel rendered inside the touch sheet frame.',
  },
  {
    name: 'Touch heading',
    required: false,
    description:
      'Current action-sheet title, updated when a nested action view is opened.',
  },
  {
    name: 'Touch action list',
    required: false,
    description: 'Spacious List that groups actions in the touch presentation.',
  },
  {
    name: 'Touch action row',
    required: false,
    description:
      'ListItem button used for an action or drill-in entry in the touch presentation.',
  },
  {
    name: 'Touch divider',
    required: false,
    description: 'Divider between action groups in the touch presentation.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DropdownMenu',
  displayName: 'Dropdown Menu',
  group: 'DropdownMenu',
  category: 'Action',
  keywords: [
    'dropdown',
    'menu',
    'popover',
    'select',
    'actions',
    'contextmenu',
    'overflow',
    'kebab',
    'menubutton',
  ],
  playground: {
    // `items` is required; without seeded entries the properties-tab preview
    // renders an empty trigger button. Provide a few actions so the preview
    // is meaningful.
    defaults: {
      button: {label: 'Actions'},
      presentation: 'popover',
      items: [
        {label: 'Edit project', icon: 'wrench'},
        {label: 'Duplicate project', icon: 'copy'},
        {label: 'Share project', icon: 'externalLink'},
        {label: 'Archive project', icon: 'stop'},
      ],
    },
  },
  theming: {
    targets: [
      {
        className: 'astryx-dropdown-menu',
        visualProps: ['presentation'],
      },
      {
        className: 'astryx-dropdown-menu-item',
        visualProps: ['size', 'variant'],
      },
      {
        className: 'astryx-dropdown-menu-radio',
        visualProps: ['size'],
        states: ['checked', 'disabled'],
      },
      {className: 'astryx-dropdown-menu-section-heading'},
      {className: 'astryx-dropdown-menu-divider'},
      {className: 'astryx-dropdown-menu-indicator-icon'},
    ],
    vars: [
      {
        name: '--_dropdown-menu-radius',
        description: 'Border radius of the menu popup',
        default: 'var(--radius-container)',
        private: true,
      },
      {
        name: '--_dropdown-menu-padding',
        description: 'Inner padding of the menu popup',
        default: 'var(--spacing-1)',
        private: true,
      },
    ],
    derived: [
      {property: 'borderRadius', vars: ['--_dropdown-menu-radius']},
      {property: 'padding', vars: ['--_dropdown-menu-padding']},
    ],
  },
  description:
    'Action menu with a trigger button and anchored, bottom-sheet, or adaptive presentation.',
  props: [
    {
      name: 'button',
      type: 'DropdownMenuButtonProps',
      description:
        'Props for the trigger button (Button props except onClick). Mutually exclusive with `renderTrigger`.',
      default: "{ label: 'Menu' }",
    },
    {
      name: 'renderTrigger',
      type: '(props: DropdownMenuTriggerProps) => ReactNode',
      description:
        'Render the control the menu hangs off — an IconButton, a chip, an avatar, a list row — instead of the built-in Button. Spread the given props onto it: they carry the press model (a mouse opens on press-down, a held finger opens with the finger down), the keyboard opens, the toggle click, and `aria-haspopup`/`aria-expanded`/`aria-controls`/`id`; the menu is then named by that control through `aria-labelledby`. Mutually exclusive with `button`.',
    },

    {
      name: 'items',
      type: 'DropdownMenuOption[]',
      description:
        'Array of menu entries. Each entry is one of: an action item `{label, onClick?, href?, target?, rel?, icon?, description?, endContent?, isDisabled?, variant?, hasCloseOnSelect?, id?}` (`href` makes the row a real link, so a modified click keeps the browser\'s meaning; variant `"destructive"` renders it in the error color; `endContent` holds trailing content such as a keyboard-shortcut hint; `id` is the row\'s stable React key, needed only when the array reorders or filters), a divider `{type: "divider"}`, or a section `{type: "section", title?, id?, items: [...action items]}`.',
      required: true,
    },
    {
      name: 'presentation',
      type: "'popover' | 'bottom-sheet' | 'adaptive'",
      description:
        "Presentation surface for data-driven items. 'popover' stays anchored, 'bottom-sheet' always renders the actions in a modal BottomSheet, and 'adaptive' uses a BottomSheet on compact coarse-pointer layouts while remaining anchored elsewhere. Compound children currently support popover only.",
      default: "'popover'",
    },
    {
      name: 'isMenuOpen',
      type: 'boolean',
      description:
        'Controlled open state for the menu. Mounting with true renders the menu open without moving focus into it; focus moves to the first item only when the menu opens after mount.',
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description: 'Callback fired when the open state changes.',
    },
    {
      name: 'menuWidth',
      type: 'number | string',
      description:
        'Minimum width for the popover presentation. Length values may grow for content; intrinsic and CSS-wide keywords select the preferred inline size. Every form is capped to the available viewport space. Defaults to matching the trigger width up to that cap.',
    },
    {
      name: 'menuMaxHeight',
      type: 'number',
      description:
        'Maximum height in pixels for the popover presentation, for a menu that must fit its rows. Lifts the default 300px cap; the viewport still bounds it.',
    },
    {
      name: 'header',
      type: 'ReactNode',
      description:
        'Content above the rows and outside the menu itself — a filter field, a toggle. A menu holds only its rows, so a control that is not a row goes here or in `footer`, never among the rows. It keeps its own keys and presses. With a header or footer the popover is a modal dialog around the menu: Tab and Shift+Tab move through the header, the menu and the footer and wrap at either end, and Escape closes. The bottom sheet shows it above the actions.',
    },
    {
      name: 'footer',
      type: 'ReactNode',
      description:
        'Content below the rows and outside the menu itself — a "Create" button. Tab from the menu moves into it, and Tab past its last control wraps to the start of the dialog (see `header`). The bottom sheet shows it below the actions.',
    },
    {
      name: 'placement',
      type: "'above' | 'below' | 'start' | 'end'",
      description:
        "Popover placement relative to the trigger. Ignored by the bottom-sheet presentation. Logical: start/end resolve against the menu's own inherited direction (RTL mirrors).",
      default: "'below'",
    },
    {
      name: 'alignment',
      type: "'start' | 'center' | 'end'",
      description:
        "Popover alignment along the placement axis. Ignored by the bottom-sheet presentation. Logical: start/end follow the menu's own inherited direction (RTL mirrors).",
      default: "'start'",
    },
    {
      name: 'onClick',
      type: '() => void',
      description:
        'Callback fired for accepted trigger activation. The trailing click from the same press that light-dismissed the menu is ignored.',
    },
    {
      name: 'hasChevron',
      type: 'boolean',
      description:
        'Whether to show a chevron icon on the trigger button. Set to false for icon-only triggers.',
      default: 'true',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Compound-mode menu content: DropdownMenuItem, DropdownMenuDivider, DropdownMenuSubMenu (a flyout on a laptop, a drilled-in view with a Back row on a phone), and the selectable items. Mutually exclusive with `items`.',
    },
  ],
  components: [{name: 'DropdownMenuItem'}],
  usage: {
    anatomy,
    description:
      'A dropdown menu that displays a list of actionable items in a popup triggered by a button. Use to present action options as a next step in a process, or to offer contextual actions without cluttering the interface. Like the menus of macOS and iOS, the row under the pointer when it is released is the row that acts, the highlight follows a held mouse or finger, a mouse opens it on press and can drag straight into it, and a finger held on the trigger opens it with the finger down.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep menu items concise and action-oriented so users can scan options quickly.',
      },
      {
        guidance: true,
        description:
          'Use sections and dividers to group related actions when the menu has many items.',
      },
      {
        guidance: true,
        description:
          'For a short, flat action set, use presentation="bottom-sheet" when product policy calls for a modal touch surface.',
      },
      {
        guidance: true,
        description:
          'Use presentation="adaptive" when the same short action set should remain anchored on pointer layouts and become a BottomSheet on compact coarse-pointer layouts.',
      },
      {
        guidance: true,
        description:
          'For a hierarchy that cannot fit as adjacent flyouts on a compact touch surface, a product may explicitly use a drill-in interaction with a Back action.',
      },
      {
        guidance: true,
        description:
          'Choose presentation explicitly in product code. A compact, coarse-pointer, hover-free media query is one useful policy, but DropdownMenu does not impose a universal device breakpoint.',
      },
      {
        guidance: true,
        description:
          'When the content is no longer a short list of immediate actions, reevaluate the interaction and choose a component that matches the actual task; content traits alone do not determine the component.',
      },
      {
        guidance: false,
        description:
          'Use a DropdownMenu for navigation; use a navigation component instead.',
      },
      {
        guidance: false,
        description:
          'Place more than 10–12 items in a single menu without grouping them into sections.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      'A dropdown menu that displays a list of actionable items in a popup triggered by a button. Use to present action options as a next step in a process, or to offer contextual actions without cluttering the interface.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep menu items concise and action-oriented so users can scan options quickly.',
      },
      {
        guidance: true,
        description:
          'Use sections and dividers to group related actions when the menu has many items.',
      },
      {
        guidance: true,
        description:
          'For a short, flat action set, use presentation="bottom-sheet" when product policy calls for a modal touch surface.',
      },
      {
        guidance: true,
        description:
          'Use presentation="adaptive" when the same short action set should remain anchored on pointer layouts and become a BottomSheet on compact coarse-pointer layouts.',
      },
      {
        guidance: true,
        description:
          'For a hierarchy that cannot fit as adjacent flyouts on a compact touch surface, a product may explicitly use a drill-in interaction with a Back action.',
      },
      {
        guidance: true,
        description:
          'Choose presentation explicitly in product code. A compact, coarse-pointer, hover-free media query is one useful policy, but DropdownMenu does not impose a universal device breakpoint.',
      },
      {
        guidance: true,
        description:
          'When the content is no longer a short list of immediate actions, reevaluate the interaction and choose a component that matches the actual task; content traits alone do not determine the component.',
      },
      {
        guidance: false,
        description:
          'Use a DropdownMenu for navigation; use a navigation component instead.',
      },
      {
        guidance: false,
        description:
          'Place more than 10–12 items in a single menu without grouping them into sections.',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'dropdown menu for actionable items in popup',
  usage: {
    anatomy,
    description:
      'A dropdown menu that displays a list of actionable items in a popup triggered by a button. Use to present action options as a next step in a process, or to offer contextual actions without cluttering the interface.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep menu items concise and action-oriented so users can scan options quickly.',
      },
      {
        guidance: true,
        description:
          'Use sections and dividers to group related actions when the menu has many items.',
      },
      {
        guidance: true,
        description:
          'For a short, flat action set, use presentation="bottom-sheet" when product policy calls for a modal touch surface.',
      },
      {
        guidance: true,
        description:
          'Use presentation="adaptive" when the same short action set should remain anchored on pointer layouts and become a BottomSheet on compact coarse-pointer layouts.',
      },
      {
        guidance: true,
        description:
          'For a hierarchy that cannot fit as adjacent flyouts on a compact touch surface, a product may explicitly use a drill-in interaction with a Back action.',
      },
      {
        guidance: true,
        description:
          'Choose presentation explicitly in product code. A compact, coarse-pointer, hover-free media query is one useful policy, but DropdownMenu does not impose a universal device breakpoint.',
      },
      {
        guidance: true,
        description:
          'When the content is no longer a short list of immediate actions, reevaluate the interaction and choose a component that matches the actual task; content traits alone do not determine the component.',
      },
      {
        guidance: false,
        description:
          'Use a DropdownMenu for navigation; use a navigation component instead.',
      },
      {
        guidance: false,
        description:
          'Place more than 10–12 items in a single menu without grouping them into sections.',
      },
    ],
  },
};
