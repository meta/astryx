// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentAnatomyElement[]} */
const anatomy = [
  {
    name: 'Trigger button',
    required: true,
    description:
      'Icon-only Button that provides the visible overflow-menu entry point.',
  },
  {
    name: 'Icon-resolved trigger icon',
    required: false,
    description:
      'Default semantic three-dot artwork resolved from the active Icon registry.',
  },
  {
    name: 'Caller-rendered trigger content',
    required: false,
    description:
      'Arbitrary React content supplied directly as the trigger icon override.',
  },
  {
    name: 'Menu surface',
    required: true,
    description:
      'DropdownMenu panel that also carries MoreMenu’s current public target.',
  },
  {
    name: 'Pointer action row',
    required: false,
    description:
      'Action or nested-action trigger row rendered by DropdownMenu in the anchored presentation.',
  },
  {
    name: 'Touch action row',
    required: false,
    description:
      'ListItem button rendered by DropdownMenu in the BottomSheet presentation.',
  },
];

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'MoreMenu',
  displayName: 'More Menu',
  category: 'Action',
  keywords: ["moremenu","overflow","kebab","dotmenu","threedot","ellipsis","dropdown","contextmenu","actionmenu"],
  props: [
    {
      name: 'items',
      type: 'DropdownMenuOption[]',
      description:
        'Menu items: data array of actions, dividers, and sections. Same type as DropdownMenu items prop.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible label for the trigger button (aria-label) and tooltip text.',
      default: "'More options'",
    },
    {
      name: 'variant',
      type: 'ButtonVariant',
      description: 'Visual style variant of the trigger button.',
      default: "'ghost'",
    },
    {
      name: 'size',
      type: 'ButtonSize',
      description: 'Size of the trigger button.',
      default: "'md'",
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description:
        'Override the default three-dot icon. Accepts any ReactNode.',
      slotElements: [{__element: 'Icon', props: {icon: 'check', size: 'sm'}}],
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether the menu trigger is disabled.',
      default: 'false',
    },
    {
      name: 'placement',
      type: "'above' | 'below' | 'start' | 'end'",
      description:
        "Position of the menu relative to the trigger. Logical: start/end resolve against the menu's own inherited direction (RTL mirrors).",
      default: "'below'",
    },
    {
      name: 'alignment',
      type: "'start' | 'center' | 'end'",
      description:
        "Alignment along the placement axis. Use 'end' to align the menu with the trigger's trailing edge, which is usually what an overflow menu wants.",
      default: "'start'",
    },
    {
      name: 'presentation',
      type: "'popover' | 'bottom-sheet' | 'adaptive'",
      description: 'Presentation policy forwarded to DropdownMenu. `adaptive` keeps the anchored popover on pointer-based layouts and uses a BottomSheet on a compact touch screen: a coarse primary pointer, and a viewport narrower than the theme `md` breakpoint (768px by default) or shorter than 500px.',
      default: "'popover'",
    },
    {
      name: 'onOpenChange',
      type: '(isOpen: boolean) => void',
      description: 'Callback fired when the menu opens or closes.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization (margins, positioning, sizing). Must be a stylex.create() value, not an inline style object like style={{}}.',
    },
  ],
  playground: {
    defaults: {
      items: [
        {label: 'Edit', value: 'edit'},
        {label: 'Duplicate', value: 'duplicate'},
        {label: 'Delete', value: 'delete'},
      ],
    },
  },
  theming: {
    targets: [
      {className: 'astryx-more-menu'},
    ],
  },
  usage: {
    anatomy,
    description:
      'MoreMenu is a three-dot button that opens a list of actions. Use it for secondary actions that don\'t need to be always visible, like in table rows, card headers, or toolbars.',
    bestPractices: [
      { guidance: true, description: 'Use for overflow or secondary actions; keep primary actions visible outside the menu.' },
      { guidance: true, description: 'Use dividers or sections to group related actions when the menu has many items.' },
      { guidance: true, description: 'Use `presentation="adaptive"` when the visible overflow trigger should open a thumb-reachable BottomSheet on compact touch devices.' },
      { guidance: false, description: 'Hide primary actions inside a MoreMenu; they should be directly visible.' },
    ],
  },
};
/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */
export const docsZh = {
  name: 'MoreMenu',
  displayName: 'More Menu',
  props: [
    {
      name: 'items',
      type: 'DropdownMenuOption[]',
      description:
        '菜单项，由操作、分割线和分组组成的数据数组。类型与 DropdownMenu 的 items 属性相同。',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description:
        '触发按钮的无障碍标签（aria-label）和工具提示文本。',
      default: "'More options'",
    },
    {
      name: 'variant',
      type: 'ButtonVariant',
      description: '触发按钮的视觉样式变体。',
      default: "'ghost'",
    },
    {
      name: 'size',
      type: 'ButtonSize',
      description: '触发按钮的尺寸。',
      default: "'md'",
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description:
        '覆盖默认的三点图标。接受任何 ReactNode。',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '菜单触发器是否禁用。',
      default: 'false',
    },    {
      name: 'placement',
      type: "'above' | 'below' | 'start' | 'end'",
      description:
        '菜单相对于触发按钮的位置。逻辑方向：start/end 依据菜单自身继承的书写方向解析（RTL 自动镜像）。',
      default: "'below'",
    },
    {
      name: 'alignment',
      type: "'start' | 'center' | 'end'",
      description:
        "沿放置轴的对齐方式。使用 'end' 让菜单与触发器的尾部边缘对齐，这通常是溢出菜单所需的效果。",
      default: "'start'",
    },
    {
      name: 'presentation',
      type: "'popover' | 'bottom-sheet' | 'adaptive'",
      description: '菜单呈现策略。`adaptive` 在指针布局中使用锚定浮层，在主指针为粗略指针且视口宽度小于主题的 `md` 断点（默认 768px）或高度小于 500px 时使用 BottomSheet。',
      default: "'popover'",
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '用于布局自定义的 StyleX 样式（边距、定位、尺寸）。必须是 stylex.create() 的值，不能是内联样式对象如 style={{}}。',
    },
  ],
  theming: {
    targets: [
      {className: 'astryx-more-menu'},
    ],
  },
  usage: {
    description:
      'MoreMenu is a three-dot button that opens a list of actions. Use it for secondary actions that don\'t need to be always visible, like in table rows, card headers, or toolbars.',
    bestPractices: [
      { guidance: true, description: 'Use for overflow or secondary actions; keep primary actions visible outside the menu.' },
      { guidance: true, description: 'Use dividers or sections to group related actions when the menu has many items.' },
      { guidance: true, description: 'Use `presentation="adaptive"` when the visible overflow trigger should open a thumb-reachable BottomSheet on compact touch devices.' },
      { guidance: false, description: 'Hide primary actions inside a MoreMenu; they should be directly visible.' },
    ],
  },
};

/** @type {import('@astryxdesign/cli/authoring').ComponentTranslationDoc} */
export const docsDense = {
  description:
    'Overflow menu w/ three-dot icon trigger. Convenience wrapper composing icon-only Button w/ dropdown menu, eliminating boilerplate for state management, positioning, accessibility.',
  usage: {
    anatomy,
    description:
      'MoreMenu is a three-dot button that opens a list of actions. Use it for secondary actions that don\'t need to be always visible, like in table rows, card headers, or toolbars.',
    bestPractices: [
      { guidance: true, description: 'Use for overflow or secondary actions; keep primary actions visible outside the menu.' },
      { guidance: true, description: 'Use dividers or sections to group related actions when the menu has many items.' },
      { guidance: true, description: 'Use `presentation="adaptive"` when the visible overflow trigger should open a thumb-reachable BottomSheet on compact touch devices.' },
      { guidance: false, description: 'Hide primary actions inside a MoreMenu; they should be directly visible.' },
    ],
  },
  propDescriptions: {
    items: 'Menu items (actions, dividers, sections). Same type as DropdownMenu items.',
    label: 'Accessible label (aria-label) + tooltip text.',
    variant: 'Trigger button visual style variant.',
    size: 'Trigger button size.',
    icon: 'Override default three-dot icon. Accepts any ReactNode.',
    isDisabled: 'Whether menu trigger disabled.',
    placement: 'Menu position relative to trigger. Logical (RTL mirrors).',
    alignment:
      "Alignment along the placement axis. 'end' aligns with the trigger's trailing edge.",
    presentation:
      'Popover, BottomSheet, or adaptive compact-touch presentation.',
    xstyle:
      'StyleX styles for layout customization (margins, positioning, sizing). Must be stylex.create() value.',
  },
};
