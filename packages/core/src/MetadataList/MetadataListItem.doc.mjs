// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'MetadataListItem',
  subComponentOf: 'MetadataList',
  displayName: 'Metadata List Item',
  isHiddenFromOverview: true,
  description: 'A single labeled metadata value within a MetadataList.',
  playground: {
    defaults: {label: 'Status', children: 'Active'},
    wrapper: {component: 'MetadataList'},
  },
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Content value for this metadata item.',
      required: true,
    },
    {
      name: 'label',
      type: 'string',
      description: 'Label text for this metadata item.',
      required: true,
    },
    {
      name: 'icon',
      type: 'ReactNode',
      description: 'Icon rendered before the label text.',
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
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for the item element: the label `dt` side by side, or the wrapper that holds the label and value when stacked. Must be a stylex.create() value.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class name for the item element (the label `dt` side by side, or the stacked wrapper). Prefer xstyle for styling; className is provided for integration with non-StyleX systems.',
    },
    {
      name: 'style',
      type: 'CSSProperties',
      description: 'Inline styles for the item element (the label `dt` side by side, or the stacked wrapper). Prefer xstyle for styling; inline styles bypass StyleX optimization.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: 'Ref forwarded to the item element: the label `dt` side by side, or the stacked wrapper.',
    },
    {
      name: 'data-testid',
      type: 'string',
      description: 'Test selector. Side by side, the label gets `<id>-label` and the value gets `<id>-value`; stacked, the wrapper gets `<id>`.',
    },
  ],
};

export const docsZh = {
  name: 'MetadataListItem',
  isHiddenFromOverview: true,
  displayName: 'Metadata List Item',
  description: 'MetadataList 中的单个带标签元数据值。',
  propDescriptions: {
    children: '此元数据项的内容值。',
    label: '此元数据项的标签文本。',
    icon: '标签文本前渲染的图标。',
    xstyle: '条目元素的 StyleX 样式：并排时为标签 `dt`，堆叠时为包裹标签和值的容器。必须是 stylex.create() 的值。',
    className: '条目元素的 CSS 类名（并排时为标签 `dt`，堆叠时为容器）。优先使用 xstyle。',
    style: '条目元素的内联样式（并排时为标签 `dt`，堆叠时为容器）。优先使用 xstyle。',
    ref: '转发到条目元素的 ref：并排时为标签 `dt`，堆叠时为容器。',
    'data-testid': '测试选择器。并排时标签为 `<id>-label`，值为 `<id>-value`；堆叠时容器为 `<id>`。',
  },
};

export const docsDense = {
  name: 'MetadataListItem',
  isHiddenFromOverview: true,
  displayName: 'Metadata List Item',
  description: 'single labeled value in MetadataList',
  propDescriptions: {
    children: 'value content',
    label: 'label text',
    icon: 'icon before label',
    xstyle: 'styles on label dt (side by side) or wrapper (stacked)',
    className: 'class on label dt (side by side) or wrapper (stacked)',
    style: 'inline style on label dt (side by side) or wrapper (stacked)',
    ref: 'label dt (side by side) or wrapper (stacked)',
    'data-testid': '<id>-label and <id>-value side by side; <id> on stacked wrapper',
  },
};
