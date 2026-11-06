// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'CommandPaletteItem',
  subComponentOf: 'CommandPalette',
  displayName: 'Command Palette Item',
  isHiddenFromOverview: true,
  description:
    'One option in a command palette result list. CommandPalette context supplies selection, highlight, identity, and close behavior.',
  usage: {
    description:
      'Use CommandPaletteItem for one non-interactive result row inside CommandPaletteList or CommandPaletteGroup. CommandPalette owns the composite keyboard model; standalone items expose only their explicit visual state and pointer activation.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Keep each value unique within the result list so highlight, active-descendant identity, and selection resolve to the same item.',
      },
      {
        guidance: true,
        description:
          'Inside CommandPalette, each item is an option in the listbox popup of the WAI-ARIA combobox pattern: keyboard focus stays in the query field, arrow keys move the highlight through aria-activedescendant, and Enter selects the highlighted item.',
      },
      {
        guidance: false,
        description:
          'Nest buttons, links, or other interactive controls inside an item. Option semantics make descendants presentational, so use non-interactive content such as icons, descriptions, and shortcut hints, and activate the option itself.',
      },
      {
        guidance: false,
        description:
          'Treat isHighlighted as selection. Highlight is the active keyboard result; isSelected represents the chosen value.',
      },
    ],
    anatomy: [
      {
        name: 'Item',
        required: true,
        description:
          'The option root that carries selection, disabled, item identity, interaction, and theme state.',
      },
      {
        name: 'Content',
        required: true,
        description:
          'Caller-provided non-interactive label and supporting presentation.',
      },
    ],
  },
  theming: {
    targets: [
      {
        className: 'astryx-command-palette-item',
        states: ['highlighted', 'selected', 'disabled'],
      },
    ],
  },
  props: [
    {
      name: 'value',
      type: 'string',
      description:
        'Unique value used for item identity, highlight lookup, and selection.',
      required: true,
    },
    {
      name: 'children',
      type: 'ReactNode',
      description:
        'Non-interactive item content such as a label, icon, description, or keyboard shortcut.',
      required: true,
    },
    {
      name: 'onSelect',
      type: '(value: string) => void',
      description:
        'Called after this item is activated by pointer. Keyboard selection in CommandPalette reports through CommandPalette onValueChange.',
    },
    {
      name: 'isHighlighted',
      type: 'boolean',
      description:
        'Whether this item is the active keyboard result. Derived from context when omitted inside CommandPalette.',
      default: 'false',
    },
    {
      name: 'isSelected',
      type: 'boolean',
      description:
        'Whether this item represents the selected value in picker mode. Derived from the CommandPalette value when omitted inside CommandPalette.',
      default: 'false',
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description:
        'Whether the item is unavailable and suppresses pointer activation.',
      default: 'false',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles for layout customization. Must be a stylex.create() value.',
    },
  ],
  playground: {
    defaults: {
      value: 'go-home',
      children: 'Go to Dashboard',
    },
  },
};

export const docsZh = {
  name: 'CommandPaletteItem',
  isHiddenFromOverview: true,
  displayName: 'Command Palette Item',
  description:
    '命令面板结果列表中的一个选项。CommandPalette 上下文提供选择、高亮、标识和关闭行为。',
  propDescriptions: {
    value: '用于条目标识、高亮查找和选择的唯一值。',
    children: '非交互式条目内容，例如标签、图标、描述或键盘快捷键。',
    onSelect:
      '通过指针激活此条目后调用。CommandPalette 中的键盘选择通过根组件的 onValueChange 报告。',
    isHighlighted:
      '此条目是否为当前键盘结果。在 CommandPalette 内省略时从上下文派生。',
    isSelected:
      '此条目是否代表选择器模式中的已选值。在 CommandPalette 内省略时从面板的值派生。',
    isDisabled: '条目是否不可用并禁止指针激活。',
    xstyle: 'StyleX 布局自定义样式。必须是 stylex.create() 的值。',
  },
};

export const docsDense = {
  name: 'CommandPaletteItem',
  isHiddenFromOverview: true,
  displayName: 'Command Palette Item',
  description:
    'one result option; context owns selection, highlight, identity, and close',
  propDescriptions: {
    value: 'unique value for identity, highlight lookup, and selection',
    children: 'non-interactive label and supporting content',
    onSelect:
      'called after pointer activation; palette keyboard selection uses root onValueChange',
    isHighlighted: 'active keyboard result; derived from context when omitted',
    isSelected:
      'selected value in picker mode; derived from palette value when omitted',
    isDisabled: 'unavailable; suppresses pointer activation',
    xstyle: 'StyleX layout styles; must be stylex.create() value',
  },
};
