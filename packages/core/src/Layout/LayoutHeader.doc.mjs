// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'LayoutHeader',
  subComponentOf: 'Layout',
  displayName: 'Layout Header',
  keywords: ['pageheader', 'appheader', 'header'],
  isHiddenFromOverview: true,
  description: 'Top bar for page titles, app bars, and toolbars.',
  playground: {
    defaults: {
      children: 'Page Title',
      hasDivider: true,
    },
    wrapper: {
      component: 'Layout',
    },
  },
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Header content.',
    },
    {
      name: 'hasDivider',
      type: 'boolean',
      description:
        "Border at bottom edge. When unset, the parent Layout's defaultHasDividers decides.",
      default: 'false',
    },
    {
      name: 'height',
      type: 'SizeValue',
      description:
        'Header height. Numbers are treated as pixels, strings are used as-is.',
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the landmark element.',
    },
    {
      name: 'padding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        'Internal padding on every edge, using the spacing scale. Replaces the inset from the layout; 0 is full bleed.',
    },
    {
      name: 'paddingBlockEnd',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        'Block-end (bottom) padding, using the spacing scale. Overrides padding on that edge only; paddingBlockEnd={0} docks the last child on the header bottom edge.',
    },
    {
      name: 'role',
      type: 'AriaRole',
      description: 'ARIA landmark role.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: 'Ref forwarded to the header element.',
    },
  ],
};

export const docsZh = {
  name: 'LayoutHeader',
  isHiddenFromOverview: true,
  displayName: 'Layout Header',
  description: '用于页面标题、应用栏和工具栏的顶部栏。',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: '页眉内容。',
    },
    {
      name: 'hasDivider',
      type: 'boolean',
      description:
        '底部边缘的边框。未设置时，由父级 Layout 的 defaultHasDividers 决定。',
      default: 'false',
    },
    {
      name: 'height',
      type: 'SizeValue',
      description: '页眉高度。数字类型会被解释为像素值，字符串类型按原样使用。',
    },
    {
      name: 'label',
      type: 'string',
      description: '地标元素的无障碍标签。',
    },
    {
      name: 'padding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        '所有边的内边距，使用间距刻度。替换布局提供的内边距；0 表示全出血。',
    },
    {
      name: 'paddingBlockEnd',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        '块结束（底部）内边距，使用间距刻度。仅在该边上覆盖 padding；paddingBlockEnd={0} 将最后一个子元素停靠在页眉底边。',
    },
    {
      name: 'role',
      type: 'AriaRole',
      description: 'ARIA 地标角色。',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: '转发到页眉元素的 ref。',
    },
  ],
};

export const docsDense = {
  name: 'LayoutHeader',
  isHiddenFromOverview: true,
  displayName: 'Layout Header',
  description: 'Top bar for page titles, app bars, toolbars.',
  propDescriptions: {
    children: 'Header content.',
    hasDivider: 'Border at bottom edge; unset uses the Layout default.',
    height: 'Header height.',
    label: 'Accessible label for landmark element.',
    padding:
      'Padding on every edge; replaces the layout inset. 0 is full bleed.',
    paddingBlockEnd:
      'Block-end (bottom) padding override; wins over padding on that edge. 0 docks the last child on the header bottom edge.',
    role: 'ARIA landmark role.',
    ref: 'Ref forwarded to the header element.',
  },
};
