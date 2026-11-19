// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'CommandPaletteInput',
  subComponentOf: 'CommandPalette',
  displayName: 'Command Palette Input',
  isHiddenFromOverview: true,
  description:
    'Search input slot. Auto-focuses on mount. Wires to command palette context when used inside CommandPalette.',
  usage: {
    description:
      'Use CommandPaletteInput inside CommandPalette for a popup-backed command query, or as an independent search field when no result popup is present.',
    bestPractices: [
      {
        guidance: true,
        description:
          'Pass a concise label that identifies what can be searched when "Search commands" does not describe it; the placeholder is never the field\'s name.',
      },
      {
        guidance: true,
        description:
          'Use endContent for short supporting controls or shortcut hints at the trailing edge.',
      },
      {
        guidance: false,
        description:
          'Override combobox role or popup state. CommandPaletteInput owns those semantics when connected to CommandPalette.',
      },
    ],
    anatomy: [
      {
        name: 'Input',
        required: true,
        description:
          'The surrounding inline layout for the search glyph, query field, and trailing content.',
      },
      {
        name: 'Search glyph',
        required: true,
        description: 'A decorative search icon before the query field.',
      },
      {
        name: 'Query field',
        required: true,
        description:
          'The native text field. It is a searchbox when standalone without popup attributes and a combobox when popup relationships are supplied or CommandPalette context is present.',
      },
      {
        name: 'Loading spinner',
        required: false,
        description:
          'A delayed pending indicator shown before trailing content while search is busy.',
      },
      {
        name: 'Trailing content',
        required: false,
        description:
          'Caller-provided supporting content such as a clear control or shortcut hint.',
      },
    ],
  },
  theming: {
    targets: [{className: 'astryx-command-palette-input'}],
  },
  props: [
    {
      name: 'placeholder',
      type: 'string',
      description: 'Placeholder text for the input.',
      default: "'Search…'",
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible label for the query field, announced by screen readers. Defaults to the translated "Search commands"; the placeholder is never used as the name.',
    },
    {
      name: 'hasAutoFocus',
      type: 'boolean',
      description:
        'Auto-focus the input when mounted. Automatically disabled when inside an inline command palette.',
      default: 'true',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Content rendered at the trailing end of the input, after the spinner. Use for clear buttons or keyboard shortcut hints.',
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
      name: 'value',
      type: 'string',
      description:
        'Search value. When omitted inside CommandPalette, reads from context.',
    },
    {
      name: 'onValueChange',
      type: '(value: string) => void',
      description:
        'Called when search value changes. When omitted inside CommandPalette, writes to context.',
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
      placeholder: 'Search commands, files, or actions...',
      hasAutoFocus: false,
    },
  },
};

export const docsZh = {
  name: 'CommandPaletteInput',
  isHiddenFromOverview: true,
  displayName: 'Command Palette Input',
  description:
    '搜索输入插槽。挂载时自动聚焦。在 CommandPalette 内使用时连接到上下文。',
  propDescriptions: {
    placeholder: '输入框的占位文本。',
    label:
      '查询字段的无障碍标签，供屏幕阅读器朗读。默认为翻译后的 "Search commands"；占位文本不会用作名称。',
    hasAutoFocus: '挂载时自动聚焦输入框。内联命令面板中自动禁用。',
    endContent: '渲染在输入框末尾的内容，位于加载指示器之后。',
    value: '搜索值。在 CommandPalette 内省略时从上下文读取。',
    onValueChange: '搜索值变化时调用。在 CommandPalette 内省略时写入上下文。',
    xstyle: 'StyleX 布局自定义样式。必须是 stylex.create() 的值。',
  },
};

export const docsDense = {
  name: 'CommandPaletteInput',
  isHiddenFromOverview: true,
  displayName: 'Command Palette Input',
  description:
    'search input; auto-focus on mount; wires to context inside CommandPalette',
  propDescriptions: {
    placeholder: 'input placeholder text',
    label:
      'accessible label for the query field; default "Search commands", never the placeholder',
    hasAutoFocus: 'auto-focus on mount; auto-disabled in inline mode',
    endContent: 'trailing content after spinner',
    value: 'search value; reads context when omitted inside palette',
    onValueChange:
      'called on change; writes context when omitted inside palette',
    xstyle: 'StyleX layout styles; must be stylex.create() value',
  },
};
