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
      description: 'Border at top edge.',
      default: 'false',
    },
    {
      name: 'height',
      type: 'SizeValue',
      description: 'Footer height. Numbers are treated as pixels, strings are used as-is.',
    },
    {
      name: 'label',
      type: 'string',
      description: 'Accessible label for the landmark element.',
    },
    {
      name: 'role',
      type: 'AriaRole',
      description: 'ARIA landmark role.',
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
      description: '顶部边缘的边框。',
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
      name: 'role',
      type: 'AriaRole',
      description: 'ARIA 地标角色。',
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
    hasDivider: 'Border at top edge.',
    height: 'Footer height.',
    label: 'Accessible label for landmark element.',
    role: 'ARIA landmark role.',
  },
};
