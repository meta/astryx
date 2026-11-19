// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'LayoutFooter',
  subComponentOf: 'Layout',
  displayName: 'Layout Footer',
  isHiddenFromOverview: true,
  description: 'Bottom bar for action bars, pagination, and status bars.',
  playground: {
    defaults: {
      children: 'Footer content: status bar or actions',
      hasDivider: true,
    },
    wrapper: {
      component: 'Layout',
      slotProp: 'footer',
      props: {
        content: {
          __element: 'LayoutContent',
          props: {},
          children: 'Main content area',
        },
      },
    },
  },
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Footer content.',
    },
    {
      name: 'hasDivider',
      type: 'boolean',
      description:
        "Border at top edge. When unset, the parent Layout's defaultHasDividers decides.",
      default: 'false',
    },
    {
      name: 'height',
      type: 'SizeValue',
      description:
        'Footer height. Numbers are treated as pixels, strings are used as-is.',
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
      name: 'role',
      type: 'AriaRole',
      description: 'ARIA landmark role.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: 'Ref forwarded to the footer element.',
    },
  ],
};

export const docsZh = {
  name: 'LayoutFooter',
  isHiddenFromOverview: true,
  displayName: 'Layout Footer',
  description: '用于操作栏、分页和状态栏的底部栏。',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: '页脚内容。',
    },
    {
      name: 'hasDivider',
      type: 'boolean',
      description:
        '顶部边缘的边框。未设置时，由父级 Layout 的 defaultHasDividers 决定。',
      default: 'false',
    },
    {
      name: 'height',
      type: 'SizeValue',
      description: '页脚高度。数字类型会被解释为像素值，字符串类型按原样使用。',
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
      name: 'role',
      type: 'AriaRole',
      description: 'ARIA 地标角色。',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: '转发到页脚元素的 ref。',
    },
  ],
};

export const docsDense = {
  name: 'LayoutFooter',
  isHiddenFromOverview: true,
  displayName: 'Layout Footer',
  description: 'Bottom bar for action bars, pagination, status bars.',
  propDescriptions: {
    children: 'Footer content.',
    hasDivider: 'Border at top edge; unset uses the Layout default.',
    height: 'Footer height.',
    label: 'Accessible label for landmark element.',
    padding:
      'Padding on every edge; replaces the layout inset. 0 is full bleed.',
    role: 'ARIA landmark role.',
    ref: 'Ref forwarded to the footer element.',
  },
};
