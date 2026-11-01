// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'DropdownMenuSubMenu',
  subComponentOf: 'DropdownMenu',
  displayName: 'Dropdown Menu Submenu',
  isHiddenFromOverview: true,
  description:
    'A single menu row that reveals a nested flyout of its own items. The row adopts DropdownMenuItem semantics (label / icon / description / isDisabled); its children become the flyout content. Opens inline-end with viewport auto-flip; Right/Enter/Space opens and focuses the first item, Left/Escape closes and returns focus to the trigger (Right/Left swap in RTL). On a phone (a coarse pointer, decided when the menu opened) the row drills in instead: its rows replace the menu\'s rows in the same box, led by a Back row named "Back to <parent>", and Back, Escape or ArrowLeft return to the row. Host attributes and DOM event handlers (aria-*, data-*, id) reach the trigger row, the element carrying role="menuitem" and aria-haspopup="menu"; a caller\'s handlers run after the row\'s own, except for the keys that open the flyout (the open arrow, Enter, Space) and a click on a disabled row. For data-driven menus, give a menu item a nested `items` array instead of using this component directly.',
  playground: {
    defaults: {label: 'Move to'},
  },
  props: [
    {
      name: 'label',
      type: 'ReactNode',
      required: true,
      description: 'Primary label text for the trigger row.',
    },
    {
      name: 'icon',
      type: 'IconType',
      description:
        'Icon to display before the label. See `astryx docs icons` for valid semantic names.',
    },
    {
      name: 'description',
      type: 'ReactNode',
      description: 'Secondary description text displayed below the label.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      required: true,
      description:
        'The flyout menu items: the same components used at the top level (DropdownMenuItem, nested DropdownMenuSubMenu, selectable items).',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      default: 'false',
      description:
        'A disabled submenu renders its trigger row but never opens the flyout.',
    },
    {
      name: 'hasSpinner',
      type: 'boolean',
      default: 'false',
      description:
        "Show a spinner in place of the caret, e.g. while a lazy submenu's children are loading.",
    },
    {
      name: 'menuWidth',
      type: 'number | string',
      description:
        'Minimum flyout width. The flyout may grow for its content, but it is capped to the available viewport space. Defaults to intrinsic sizing (min 160px).',
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description: 'Called when the flyout opens or closes.',
    },
    {
      name: 'presentation',
      type: "'flyout' | 'drill-in' | 'adaptive'",
      description:
        "How the sub-menu shows its rows. 'flyout' opens them beside the row; 'drill-in' replaces the menu's rows with them and a Back row, in the same box; 'adaptive' drills in when a finger opened the menu (a coarse pointer, decided when the menu opened) and flies out otherwise.",
      default: "'adaptive'",
    },
    {
      name: 'header',
      type: 'ReactNode',
      description:
        'Content above the sub-menu\'s rows and outside its menu, a field that filters them, say. It keeps its own keys and presses. With a header or footer the sub-menu\'s surface (the flyout, or the drilled-in view on a phone) is a modal dialog named by the row, beside the menu rather than inside it: the row says aria-haspopup="dialog", Tab and Shift+Tab move through the header, the rows and the footer and wrap, Escape returns to the row, and a pointer leaving the flyout closes it only once focus leaves too. A ContextMenu does not show it.',
    },
    {
      name: 'footer',
      type: 'ReactNode',
      description:
        "Content below the sub-menu's rows and outside its menu, a door to where the options are managed, say. Same rules as header.",
    },
    {
      name: 'menuDataTestId',
      type: 'string',
      description:
        'Test id for the sub-menu\'s own role="menu" element: the flyout, or the drilled-in list on a phone. The trigger row takes data-testid.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for the trigger row. Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLElement>',
      description:
        'Ref forwarded to the trigger row, the element carrying role="menuitem" and aria-haspopup="menu" ("dialog" with a header or footer).',
    },
  ],
};

export const docsDense = {
  name: 'DropdownMenuSubMenu',
  isHiddenFromOverview: true,
  displayName: 'Dropdown Menu Submenu',
  description:
    'menu row that reveals a nested flyout of its own children/items (single component, not Sub/SubTrigger/SubContent); drills in on a phone',
  propDescriptions: {
    label: 'primary label text for the trigger row',
    icon: 'icon before label',
    description: 'secondary text below label',
    children: 'flyout menu items (same components as top level)',
    isDisabled: 'renders trigger but never opens',
    hasSpinner: 'spinner instead of caret for async children',
    menuWidth:
      'minimum flyout width, capped to the viewport (default: content, min 160px)',
    onOpenChange: 'called when flyout opens/closes',
    presentation:
      "'flyout' beside the row | 'drill-in' replaces the rows + Back row | 'adaptive' (default) drills in on a coarse pointer",
    header:
      'content above the rows, outside the menu; surface becomes a modal dialog named by the row (Tab wraps, Escape returns to the row)',
    footer: 'content below the rows, outside the menu; same rules as header',
    menuDataTestId: 'test id for the flyout or drilled-in role="menu"',
    xstyle: 'StyleX styles for the trigger row',
    ref: 'ref to the trigger row (role="menuitem")',
  },
};
