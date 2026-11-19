// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Trigger area',
    required: true,
    description:
      'Caller-provided region that accepts right-click, keyboard context-menu, and long-press input.',
  },
  {
    name: 'Pointer menu surface',
    required: false,
    description:
      'Cursor-positioned menu panel used by the pointer presentation.',
  },
  {
    name: 'Pointer action row',
    required: false,
    description:
      'DropdownMenu-owned action, selectable option, or submenu row in the pointer presentation.',
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
      'ContextMenu-owned content panel rendered inside the touch sheet frame.',
  },
  {
    name: 'Touch action list',
    required: false,
    description: 'Spacious List that groups data-driven touch actions.',
  },
  {
    name: 'Touch action row',
    required: false,
    description:
      'ListItem button used for a data-driven action or drill-in entry in the touch presentation.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ContextMenu',
  displayName: 'Context Menu',
  group: 'ContextMenu',
  category: 'Action',
  isHiddenFromOverview: true,
  keywords: [
    'contextmenu',
    'right-click',
    'menu',
    'popover',
    'actions',
    'context',
  ],
  theming: {
    targets: [{className: 'astryx-context-menu'}],
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
    'A context menu that appears on right-click at the cursor position. Wraps trigger content as children.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'The trigger area: right-click on this content to open the menu.',
      required: true,
    },
    {
      name: 'items',
      type: 'ContextMenuOption[]',
      description:
        'Data-driven menu entries. Pass exactly one of `items` or `menuContent`. Each entry is one of: an action item `{label, onClick?, icon?, isDisabled?, variant?, items?}` (nested `items` open a flyout in popover presentation and drill into a new view in bottom-sheet presentation; variant `"destructive"` renders it in the error color), a divider `{type: "divider"}`, or a section `{type: "section", title?, items: [...action items]}`.',
    },
    {
      name: 'menuContent',
      type: 'ReactNode',
      description:
        'Custom JSX menu content for compound mode. Pass exactly one of `menuContent` or `items`.',
    },
    {
      name: 'menuWidth',
      type: 'number | string',
      description: 'Custom menu width.',
      default: "'160px'",
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size of menu items: controls padding density.',
      default: "'md'",
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible name for the menu surface, announced when it opens.',
      default: "'Context menu'",
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description: 'Callback fired when the menu opens or closes.',
    },
    {
      name: 'presentation',
      type: "'popover' | 'bottom-sheet' | 'adaptive'",
      description:
        'Presentation policy. `popover` opens at the pointer position, `bottom-sheet` always uses an action sheet, and `adaptive` uses the BottomSheet on a compact touch screen: a coarse primary pointer, and a viewport narrower than the theme `md` breakpoint (768px by default) or shorter than 500px.',
      default: "'popover'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'When true, right-click shows the native browser context menu instead.',
      default: 'false',
    },
    {
      name: 'triggerXstyle',
      type: 'StyleXStyles | StyleXStyles[]',
      description:
        'Styles applied to the trigger wrapper. Accepts `stylex.create()` values, not inline style objects.',
    },
    {
      name: 'triggerAs',
      type: "'div' | 'span'",
      description:
        "The element the trigger wrapper renders as. 'div' is a block; 'span' an inline wrapper, so a reference inside prose can own a context menu without breaking the text flow.",
      default: "'div'",
    },
  ],
  components: [{name: 'ContextMenuItem'}],
  usage: {
    anatomy,
    description:
      'A right-click context menu that appears at the cursor position. Use to provide contextual actions for specific elements or regions without cluttering the UI with visible buttons.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep menu items concise and action-oriented; users expect quick access to contextual actions.',
      },
      {
        guidance: true,
        description:
          'Use sections and dividers to group related actions when the menu has many items.',
      },
      {
        guidance: true,
        description:
          'Use `presentation="adaptive"` when right-click should remain cursor-positioned on desktop while long-press opens a reachable BottomSheet on compact touch devices.',
      },
      {
        guidance: true,
        description:
          'Ensure all context menu actions are also accessible via other UI elements for keyboard-only users.',
      },
      {
        guidance: true,
        description:
          'Keep a visible MoreMenu or equivalent trigger for important mobile actions; long-press must not be the only route.',
      },
      {
        guidance: false,
        description:
          'Use a ContextMenu as the only way to access important actions; not all users know to right-click.',
      },
      {
        guidance: false,
        description:
          'Place more than 10–12 items in a single menu without grouping them into sections.',
      },
    ],
  },
  playground: {
    defaults: {
      children: {
        __element: 'Card',
        props: {padding: 6},
        children: {
          __element: 'Text',
          props: {color: 'secondary'},
          children: 'Right-click this area',
        },
      },
      items: [
        {label: 'Edit'},
        {label: 'Duplicate'},
        {type: 'divider'},
        {label: 'Delete'},
      ],
    },
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsZh = {
  usage: {
    description:
      '右键点击时在光标位置出现的上下文菜单。用于为特定元素或区域提供上下文操作，而不使 UI 杂乱。',
    bestPractices: [
      {guidance: true, description: '保持菜单项简洁和面向操作。'},
      {guidance: true, description: '有很多项时使用分组和分隔线。'},
      {
        guidance: true,
        description:
          '在桌面端需要光标定位、紧凑触控设备上需要 BottomSheet 时，使用 `presentation="adaptive"`。',
      },
      {
        guidance: true,
        description: '确保所有上下文菜单操作也可通过其他 UI 元素访问。',
      },
      {
        guidance: true,
        description:
          '重要的移动端操作还应提供可见的 MoreMenu 或同等入口，不要只依赖长按。',
      },
      {
        guidance: false,
        description: '将上下文菜单作为访问重要操作的唯一方式。',
      },
      {
        guidance: false,
        description: '在单个菜单中放置超过 10-12 个项而不分组。',
      },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description: 'right-click context menu at cursor position',
  usage: {
    anatomy,
    description:
      'A right-click context menu that appears at the cursor position. Use to provide contextual actions for specific elements or regions.',
    bestPractices: [
      {guidance: true, description: 'Keep items concise and action-oriented.'},
      {
        guidance: true,
        description: 'Group related actions with sections and dividers.',
      },
      {
        guidance: true,
        description:
          'Use adaptive presentation for cursor popover on desktop and BottomSheet on compact touch.',
      },
      {
        guidance: true,
        description:
          'Ensure actions are also accessible via other UI elements.',
      },
      {
        guidance: true,
        description: 'Keep a visible mobile entry point for important actions.',
      },
      {
        guidance: false,
        description: 'Use as the only way to access important actions.',
      },
      {
        guidance: false,
        description: 'Place more than 10–12 items without grouping.',
      },
    ],
  },
};
