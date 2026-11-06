// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ListItem',
  subComponentOf: 'List',
  displayName: 'List Item',
  isHiddenFromOverview: true,
  description:
    'List item with label, description, start/end content slots, and interactive patterns.',
  props: [
    {
      name: 'label',
      type: 'ReactNode',
      description:
        'Primary content. A plain string gets single-line truncation automatically; a ReactNode renders as given, so child components control their own text behavior.',
      required: true,
    },
    {
      name: 'description',
      type: 'ReactNode',
      description:
        'Secondary content below the label. A plain string gets single-line truncation automatically; a ReactNode lets child components control their own wrapping and line-clamp behavior.',
    },
    {
      name: 'startContent',
      type: 'ReactNode',
      description:
        'Content rendered before the label area (e.g. icon, avatar).',
      slotElements: [
        {
          __element: 'Icon',
          props: {
            icon: 'check',
            size: 'sm',
          },
        },
      ],
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Content rendered after the label area (e.g. badge, chevron).',
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
      name: 'onClick',
      type: '(e: MouseEvent) => void',
      description: 'Click handler; enables the invisible button pattern.',
    },
    {
      name: 'interactiveRef',
      type: 'RefObject<HTMLElement | null>',
      description:
        "Ref to a nested control (e.g. a checkbox in startContent) that owns the item's keyboard access and action. The row becomes an enlarged click/tap target that delegates surface clicks to it (useClickableContainer) and renders no invisible button/anchor, so the row adds no second tab stop (WCAG 4.1.2). Mutually exclusive with onClick/href; those are ignored when set.",
    },
    {
      name: 'href',
      type: 'string',
      description:
        'Link URL; enables the invisible anchor pattern. The destination follows the shared navigation rule described on the Link `href` prop.',
    },
    {
      name: 'target',
      type: 'string',
      description:
        'Link target attribute, only applicable when href is provided. target="_blank" automatically adds noopener noreferrer.',
    },
    {
      name: 'rel',
      type: 'string',
      description:
        'Link relationship tokens. noopener noreferrer are merged automatically for target="_blank".',
    },
    {
      name: 'align',
      type: "'center' | 'start' | 'first-line'",
      description:
        'Vertical alignment of the start and end content against the label, passed through to Item unchanged. `first-line` keeps a small mark (a status dot, an icon) level with the first line of a wrapped label. See Item.align.',
      default: "'center'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Disabled state; sets aria-disabled on the item.',
      default: 'false',
    },
    {
      name: 'isSelected',
      type: 'boolean',
      description: 'Selected state; marks the item as the current one with aria-current="true" (a list item cannot carry aria-selected).',
      default: 'false',
    },
    {
      name: 'swipeActions',
      type: '{leading?: ItemSwipeAction[]; trailing?: ItemSwipeAction[]}',
      description:
        "Swipe actions for touch, passed through to Item unchanged: the verbs a sideways drag uncovers on each side, each `{id?, label, icon?, onActivate, isDisabled?, variant?: 'neutral' | 'accent' | 'destructive', hasRemoval?}`. See Item.swipeActions; List clips its rows in the inline axis for them.",
    },
    {
      name: 'swipeBehavior',
      type: "'reveal' | 'commit'",
      description:
        'What a swipe does, passed through to Item unchanged. See Item.swipeBehavior.',
      default: "'reveal'",
    },
  ],
};

export const docsZh = {
  name: 'ListItem',
  isHiddenFromOverview: true,
  displayName: 'List Item',
  description: '列表项，包含标签、描述、起始/结束内容插槽和交互模式。',
  props: [
    {
      name: 'label',
      type: 'ReactNode',
      description:
        '主要内容。纯字符串会自动应用单行截断；ReactNode 按原样渲染，由子组件自行控制文本行为。',
      required: true,
    },
    {
      name: 'description',
      type: 'ReactNode',
      description:
        '标签下方的次要内容。纯字符串会自动应用单行截断；ReactNode 允许子组件自行控制换行和多行截断行为。',
    },
    {
      name: 'startContent',
      type: 'ReactNode',
      description: '在标签区域之前渲染的内容（如图标、头像）。',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description: '在标签区域之后渲染的内容（如徽章、箭头）。',
    },
    {
      name: 'onClick',
      type: '(e: MouseEvent) => void',
      description: '点击处理函数；启用隐形按钮模式。',
    },
    {
      name: 'interactiveRef',
      type: 'RefObject<HTMLElement | null>',
      description:
        '指向嵌套控件（如 startContent 中的复选框）的 ref，该控件承载项目的键盘访问和操作。行成为更大的点击/触摸目标，将表面点击委托给该控件（useClickableContainer），且不渲染不可见按钮/锚点，因此行不会增加第二个 Tab 停留点（WCAG 4.1.2）。与 onClick/href 互斥——设置后二者将被忽略。',
    },
    {
      name: 'href',
      type: 'string',
      description: '链接 URL；启用隐形锚点模式。',
    },
    {
      name: 'target',
      type: 'string',
      description:
        '链接 target 属性，仅在提供 href 时适用。target="_blank" 会自动添加 noopener noreferrer。',
    },
    {
      name: 'rel',
      type: 'string',
      description:
        '链接关系标记。target="_blank" 会自动合并 noopener noreferrer。',
    },
    {
      name: 'align',
      type: "'center' | 'start' | 'first-line'",
      description:
        '起始和结束内容相对于标签的垂直对齐方式，原样传递给 Item。`first-line` 让小标记（状态点、图标）与换行标签的第一行保持水平。参见 Item.align。',
      default: "'center'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '禁用状态；在项目上设置 aria-disabled。',
      default: 'false',
    },
    {
      name: 'isSelected',
      type: 'boolean',
      description: '选中状态；在项目上设置 aria-current="true"，将其标为当前项（列表项不能使用 aria-selected）。',
      default: 'false',
    },
    {
      name: 'swipeActions',
      type: '{leading?: ItemSwipeAction[]; trailing?: ItemSwipeAction[]}',
      description:
        "触摸滑动操作，原样传递给 Item：横向拖动在每一侧揭示的操作，每项为 `{id?, label, icon?, onActivate, isDisabled?, variant?: 'neutral' | 'accent' | 'destructive', hasRemoval?}`。参见 Item.swipeActions；List 会在行内轴上裁剪行。",
    },
    {
      name: 'swipeBehavior',
      type: "'reveal' | 'commit'",
      description: '滑动的行为，原样传递给 Item。参见 Item.swipeBehavior。',
      default: "'reveal'",
    },
  ],
};

export const docsDense = {
  name: 'ListItem',
  isHiddenFromOverview: true,
  displayName: 'List Item',
  description:
    'List item w/ label, description, start/end content slots, interactive patterns.',
  propDescriptions: {
    align:
      "Start/end content alignment, passed to Item: 'center' (default), 'start', or 'first-line' (centered on the label's first line).",
    label:
      'Primary content. String auto-truncates; ReactNode renders as given.',
    description: 'Secondary text below label.',
    startContent: 'Content before label area (e.g. icon, avatar).',
    endContent: 'Content after label area (e.g. badge, chevron).',
    onClick: 'Click handler; enables invisible button pattern.',
    interactiveRef:
      "Ref to a nested control that owns the item's keyboard access/action; row delegates surface clicks to it (useClickableContainer), no invisible button/anchor, no second tab stop (WCAG 4.1.2). Mutually exclusive with onClick/href.",
    href: 'Link URL; enables invisible anchor pattern. Follows the shared navigation rule (see Link href).',
    target:
      'Link target attribute, only when href provided. target="_blank" auto-adds noopener noreferrer.',
    rel: 'Link relationship tokens. noopener noreferrer are merged for target="_blank".',
    isDisabled: 'Disabled state; sets aria-disabled.',
    isSelected: 'Selected state; sets aria-current="true".',
  },
};
