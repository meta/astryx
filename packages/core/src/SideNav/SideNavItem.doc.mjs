// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'SideNavItem',
  subComponentOf: 'SideNav',
  displayName: 'Side Nav Item',
  isHiddenFromOverview: true,
  description: 'Navigation item with icon, selected state, optional end content, and nesting support via children.',
  playground: {
    defaults: {label: 'Dashboard', icon: 'viewColumns', isSelected: true},
  },
  props: [
    {
      name: 'label',
      type: 'string',
      description: 'Item label.',
      required: true,
    },
    {
      name: 'as',
      type: 'LinkComponentType',
      description: 'Custom link component.',
    },
    {
      name: 'icon',
      type: 'IconType',
      description: 'Icon displayed in the outline (unselected) variant. See `astryx docs icons` for valid semantic names.',
    },
    {
      name: 'selectedIcon',
      type: 'IconType',
      description: 'Icon displayed when the item is selected (filled variant). See `astryx docs icons` for valid semantic names.',
    },
    {
      name: 'isSelected',
      type: 'boolean',
      description: 'Marks this item as the current page.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Disabled state.',
      default: 'false',
    },
    {
      name: 'href',
      type: 'string',
      description: 'Navigation URL.',
    },
    {
      name: 'onClick',
      type: '(e: MouseEvent) => void',
      description: 'Click handler.',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description: 'Passive right-side content only (badges, counts). Interactive controls go in actions.',
      slotElements: [
        {
          __element: 'Icon',
          props: {
            icon: 'chevronDown',
            size: 'sm',
          },
        },
        {
          __element: 'Badge',
          props: {
            label: '3',
          },
        },
      ],
    },
    {
      name: 'actions',
      type: 'ReactNode',
      description:
        'Row-level secondary controls (icon buttons, menus) rendered as siblings of the primary element at the trailing edge of the row: after the expand/collapse toggle, before any nested children in DOM and focus order. Each control owns its accessible name and behavior. Controls inherit the row control size through SizeContext, so an unsized icon button matches the built-in expand/collapse toggle; an explicit size still wins. Hidden while the SideNav rail is collapsed. Use endContent for passive content (badges, counts); use actions for anything interactive.',
      slotElements: [
        {
          __element: 'Button',
          props: {label: 'Rename', variant: 'ghost', size: 'sm'},
        },
      ],
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Sub-items for nesting. Nested items span the full width of the nav list, like top-level items; their content is indented one step per nesting level.',
      slotElements: [
        {
          __element: 'SideNavItem',
          props: {
            label: 'Sub Item',
          },
        },
      ],
    },
    {
      name: 'collapsible',
      type: 'boolean | { defaultIsCollapsed?: boolean, isCollapsed?: boolean, onCollapsedChange?: (isCollapsed: boolean) => void }',
      description: 'Enables collapse behavior for items with children. Pass true for uncontrolled (starts expanded), or an object for controlled mode.',
      default: 'false',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: 'Size variant for the nav item row.',
      default: "'md'",
    },
  ],
};

export const docsZh = {
  name: 'SideNavItem',
  isHiddenFromOverview: true,
  displayName: 'Side Nav Item',
  description: '导航项，支持图标、选中状态、可选尾部内容，以及通过 children 实现嵌套。',
  props: [
    {
      name: 'label',
      type: 'string',
      description: '项目标签。',
      required: true,
    },
    {
      name: 'as',
      type: 'LinkComponentType',
      description: '自定义链接组件。',
    },
    {
      name: 'icon',
      type: 'IconType',
      description: '轮廓（未选中）变体中显示的图标。',
    },
    {
      name: 'selectedIcon',
      type: 'IconType',
      description: '选中时显示的图标（填充变体）。',
    },
    {
      name: 'isSelected',
      type: 'boolean',
      description: '将此项标记为当前页面。',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '禁用状态。',
      default: 'false',
    },
    {
      name: 'href',
      type: 'string',
      description: '导航 URL。',
    },
    {
      name: 'onClick',
      type: '(e: MouseEvent) => void',
      description: '点击处理函数。',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description: '仅用于被动右侧内容（徽章、计数）。交互控件请使用 actions。',
    },
    {
      name: 'actions',
      type: 'ReactNode',
      description:
        '行级次要控件（图标按钮、菜单），作为主元素的同级节点渲染在行尾——位于展开/折叠切换按钮之后、任何嵌套子项之前（DOM 与焦点顺序一致）。每个控件自行负责其无障碍名称与行为。控件通过 SizeContext 继承行内控件尺寸，因此未指定尺寸的图标按钮会与内置的展开/折叠切换按钮保持同一尺寸；显式指定的 size 优先。侧边栏折叠为图标栏时隐藏。被动内容（徽章、计数）请使用 endContent；交互内容请使用 actions。',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: '用于嵌套的子项。',
    },
    {
      name: 'collapsible',
      type: 'boolean | { defaultIsCollapsed?: boolean, isCollapsed?: boolean, onCollapsedChange?: (isCollapsed: boolean) => void }',
      description: '启用带子项的折叠行为。传 true 为非受控模式（默认展开），或传对象用于受控模式。',
      default: 'false',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: '导航项的尺寸变体。',
      default: "'md'",
    },
  ],
};

export const docsDense = {
  name: 'SideNavItem',
  isHiddenFromOverview: true,
  displayName: 'Side Nav Item',
  description: 'Navigation item w/ icon, selected state, optional end content, nesting via children.',
  propDescriptions: {
    label: 'Item label.',
    as: 'Custom link component.',
    icon: 'Icon displayed in outline (unselected) variant.',
    selectedIcon: 'Icon displayed when item selected (filled variant).',
    isSelected: 'Marks this item as current page.',
    isDisabled: 'Disabled state.',
    href: 'Navigation URL.',
    onClick: 'Click handler.',
    endContent:
      'Passive right-side content only (badges, counts). Interactive controls go in actions.',
    actions:
      'Row-level secondary controls (icon buttons, menus) rendered as siblings of the primary element, after the expand/collapse toggle and before nested children in DOM/focus order. Inherit the row control size via SizeContext (explicit size wins). Hidden when rail collapsed. Passive content goes in endContent; interactive content goes here.',
    children: 'Sub-items for nesting. Nested rows stay full width; content indents one step per level.',
    collapsible: 'Enables collapse for items w/ children. true=uncontrolled, object=controlled mode.',
    size: "Row size variant: 'sm' | 'md' | 'lg'.",
  },
};
