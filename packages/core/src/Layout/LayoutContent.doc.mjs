// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'LayoutContent',
  subComponentOf: 'Layout',
  displayName: 'Layout Content',
  isHiddenFromOverview: true,
  description: 'Scrollable main content area.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Content.',
    },
    {
      name: 'padding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description:
        'Internal padding using the spacing scale. Overrides the default padding from the layout container.',
    },
    {
      name: 'isScrollable',
      type: 'boolean',
      description:
        'Enable scrollable overflow. With arithmetic contentWidth values, the scrollport spans through every open side while context-aware insets keep children aligned.',
      default: 'true',
    },
    {
      name: 'label',
      type: 'string',
      description:
        'Accessible label for the landmark element. While the region scrolls, it also names the scrolling region, which otherwise takes a translated "Content".',
    },
    {
      name: 'role',
      type: 'AriaRole',
      description: 'ARIA landmark role.',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: 'Ref forwarded to the content region element.',
    },
  ],
};

export const docsZh = {
  name: 'LayoutContent',
  isHiddenFromOverview: true,
  displayName: 'Layout Content',
  description: '可滚动的主内容区域。',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: '内容。',
    },
    {
      name: 'padding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description: '使用间距比例的内边距。覆盖布局容器的默认内边距。',
    },
    {
      name: 'isScrollable',
      type: 'boolean',
      description:
        '启用可滚动溢出。设置可参与算术计算的 contentWidth 时，滚动区域会延伸到所有未被面板占用的边缘，同时根据上下文调整内边距以保持子内容对齐。',
      default: 'true',
    },
    {
      name: 'label',
      type: 'string',
      description:
        '地标元素的无障碍标签。区域滚动时，它也为滚动区域命名；未提供时使用已翻译的“Content”（内容）。',
    },
    {
      name: 'role',
      type: 'AriaRole',
      description: 'ARIA 地标角色。',
    },
    {
      name: 'ref',
      type: 'React.Ref<HTMLDivElement>',
      description: '转发到内容区域元素的 ref。',
    },
  ],
};

export const docsDense = {
  name: 'LayoutContent',
  isHiddenFromOverview: true,
  displayName: 'Layout Content',
  description: 'Scrollable main content area.',
  propDescriptions: {
    children: 'Content.',
    padding: 'Internal padding on spacing scale. Overrides layout container default.',
    isScrollable:
      'Enable scrollable overflow. With arithmetic contentWidth values, the scrollport reaches open sides while context-aware insets align children.',
    label:
      'Accessible label for landmark element; also names the region while it scrolls (default "Content").',
    role: 'ARIA landmark role.',
    ref: 'Ref forwarded to the content region element.',
  },
};
