// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'GridSpan',
  subComponentOf: 'Grid',
  displayName: 'Grid Span',
  isHiddenFromOverview: true,
  description: 'Grid item that spans multiple columns or rows.',
  playground: {
    wrapper: {component: 'Grid', props: {columns: 3, gap: 2}},
    defaults: {
      columns: 2,
      children: 'Spans 2 columns',
    },
  },
  props: [
    {
      name: 'columns',
      type: "number | 'full'",
      description:
        "Columns to span; use `'full'` to span all explicit columns.",
    },
    {
      name: 'rows',
      type: 'number',
      description: 'Rows to span.',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Content.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        'StyleX styles applied to the span wrapper. Must be a stylex.create() value: not an inline style object like style={{}}.',
    },
    {
      name: 'className',
      type: 'string',
      description: 'CSS class name applied to the span wrapper.',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description:
        'Inline styles applied to the span wrapper. When `columns` or `rows` is set, its `grid-column` or `grid-row` replaces the same property in `style`.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: 'Ref forwarded to the span wrapper.',
    },
  ],
};

export const docsZh = {
  name: 'GridSpan',
  isHiddenFromOverview: true,
  displayName: 'Grid Span',
  description: '可跨越多列或多行的网格项。',
  props: [
    {
      name: 'columns',
      type: "number | 'full'",
      description: "要跨越的列数；使用 `'full'` 跨越所有显式列。",
    },
    {
      name: 'rows',
      type: 'number',
      description: '要跨越的行数。',
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: '内容。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description:
        '应用于跨度包装元素的 StyleX 样式。必须是 stylex.create() 的值，而不是 style={{}} 这样的内联样式对象。',
    },
    {
      name: 'className',
      type: 'string',
      description: '应用于跨度包装元素的 CSS 类名。',
    },
    {
      name: 'style',
      type: 'React.CSSProperties',
      description:
        '应用于跨度包装元素的内联样式。设置 `columns` 或 `rows` 时，其 `grid-column` 或 `grid-row` 会替换 `style` 中的同名属性。',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: '转发到跨度包装元素的 Ref。',
    },
  ],
};

export const docsDense = {
  name: 'GridSpan',
  displayName: 'Grid Span',
  description: 'Grid item spanning multiple columns/rows.',
  propDescriptions: {
    columns: "Columns to span; 'full' spans all explicit columns.",
    rows: 'Rows to span.',
    children: 'Content.',
    xstyle: 'StyleX styles on the span wrapper; stylex.create() value only.',
    className: 'CSS class on the span wrapper.',
    style:
      'inline styles on the span wrapper; a set columns/rows replaces its grid-column/grid-row.',
    ref: 'ref to the span wrapper div.',
  },
};
