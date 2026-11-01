// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'RadioListItem',
  subComponentOf: 'RadioList',
  displayName: 'Radio List Item',
  isHiddenFromOverview: true,
  description:
    'Individual radio item with label, description, and content slots.',
  // RadioListItem requires RadioList context; wrap it so the preview doesn't throw.
  playground: {
    defaults: {value: 'option-1', label: 'Option'},
    wrapper: {
      component: 'RadioList',
      props: {value: 'option-1', label: 'Radio list'},
    },
  },
  props: [
    {
      name: 'label',
      type: 'ReactNode',
      description:
        'Primary label for the radio item. Rich labels may contain links or buttons, which keep their own behavior without selecting the item. The label text names the radio; use aria-label only when that text is absent, or retain every visible label word in the override.',
      required: true,
    },
    {
      name: 'aria-label',
      type: 'string',
      description:
        'Plain-text accessible name for the radio, applied to the control rather than the row. It overrides the name derived from the label. Use it when a rich label has no visible text; otherwise retain every visible label word.',
    },
    {
      name: 'value',
      type: 'string',
      description: 'Value of this radio item.',
      required: true,
    },
    {
      name: 'description',
      type: 'ReactNode',
      description:
        'Secondary content displayed below the label. Links and buttons keep their own click behaviour — the row only delegates clicks from its non-interactive surface to the radio.',
    },
    {
      name: 'align',
      type: "'center' | 'start' | 'first-line'",
      description:
        'Vertical alignment of the start and end content against the label, passed through to Item unchanged. `first-line` keeps a small mark (a radio) level with the first line of a wrapped label. See Item.align.',
      default: "'center'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: 'Whether this individual radio item is disabled.',
      default: 'false',
    },
    {
      name: 'startContent',
      type: 'ReactNode',
      description: 'Content to render before the radio circle.',
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
      description: 'Content to render after the label.',
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
  ],
};

export const docsZh = {
  name: 'RadioListItem',
  isHiddenFromOverview: true,
  displayName: 'Radio List Item',
  description: '单个单选选项，包含标签、描述和内容插槽。',
  props: [
    {
      name: 'label',
      type: 'ReactNode',
      description:
        '单选选项的主标签。富内容标签可包含链接或按钮，它们保留自身行为且不会选中该选项。标签文本用于命名单选框；仅当可见文本缺失时使用 aria-label，否则覆盖值必须保留全部可见文字。',
      required: true,
    },
    {
      name: 'aria-label',
      type: 'string',
      description:
        '单选框的纯文本无障碍名称，应用于控件本身而非整行。它会覆盖由标签推导出的名称。仅当富标签没有可见文本时才完全替代；否则必须保留全部可见文字。',
    },
    {
      name: 'value',
      type: 'string',
      description: '此单选选项的值。',
      required: true,
    },
    {
      name: 'description',
      type: 'ReactNode',
      description:
        '显示在标签下方的次要内容。链接和按钮保留自身的点击行为——整行仅将非交互区域的点击委派给单选框。',
    },
    {
      name: 'align',
      type: "'center' | 'start' | 'first-line'",
      description:
        '起始和结束内容相对于标签的垂直对齐方式，原样传递给 Item。`first-line` 让小标记（单选按钮）与换行标签的第一行保持水平。参见 Item.align。',
      default: "'center'",
    },
    {
      name: 'isDisabled',
      type: 'boolean',
      description: '是否禁用此单个单选选项。',
      default: 'false',
    },
    {
      name: 'startContent',
      type: 'ReactNode',
      description: '在单选圆圈前渲染的内容。',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description: '在标签后渲染的内容。',
    },
  ],
};

export const docsDense = {
  name: 'RadioListItem',
  isHiddenFromOverview: true,
  displayName: 'Radio List Item',
  description: 'Individual radio item w/ label, description, content slots.',
  propDescriptions: {
    align:
      "Start/end content alignment, passed to Item: 'center' (default), 'start', or 'first-line' (centered on the label's first line).",
    label:
      'Primary label. String or ReactNode; nested controls keep their behavior.',
    'aria-label':
      'Plain-text radio name replacing the derived label. Use when visible text is absent; otherwise retain every visible label word.',
    value: 'Value of this radio item.',
    description: 'Secondary content below label. String or ReactNode.',
    isDisabled: 'Whether this individual radio item disabled.',
    startContent: 'Content rendered before radio circle.',
    endContent: 'Content rendered after label.',
  },
};
