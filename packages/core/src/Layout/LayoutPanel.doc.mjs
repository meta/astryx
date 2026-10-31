// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'LayoutPanel',
  subComponentOf: 'Layout',
  displayName: 'Layout Panel',
  isHiddenFromOverview: true,
  description: 'Sidebar for navigation, settings, or inspector panels.',
  playground: {
    defaults: {
      children: 'Panel Content',
      hasDivider: true,
      width: 200,
    },
    wrapper: {
      component: 'Layout',
      slotProp: 'start',
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
      description: 'Panel content.',
    },
    {
      name: 'hasDivider',
      type: 'boolean',
      description: 'Border on the appropriate edge.',
      default: 'false',
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
      description: 'Enable scrollable overflow.',
      default: 'true',
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
    {
      name: 'width',
      type: 'number | string',
      description:
        'Width of the panel. Numbers are treated as pixels, strings are used as-is. For a resizable panel, pass the size useResizable(handleRef, options) reports (width={region.size}) and give the ref to the adjacent ResizeHandle. Ignored when the deprecated resizable prop is provided.',
    },
    {
      name: 'resizable',
      type: 'ResizableProps',
      description:
        "Deprecated: resize props from useResizable's configuration-object form; the panel width is the hook's size. They carry the region's axis ('horizontal' | 'vertical'), which must match the adjacent ResizeHandle's direction. Pass width={region.size} from useResizable(handleRef, options) instead. Removed in the next minor.",
    },
  ],
};

export const docsZh = {
  name: 'LayoutPanel',
  isHiddenFromOverview: true,
  displayName: 'Layout Panel',
  description: '用于导航、设置或检查器面板的侧边栏。',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: '面板内容。',
    },
    {
      name: 'hasDivider',
      type: 'boolean',
      description: '相应边缘的边框。',
      default: 'false',
    },
    {
      name: 'padding',
      type: '0 | 0.5 | 1 | 1.5 | 2 | 3 | 4 | 5 | 6 | 8 | 10',
      description: '使用间距比例的内边距。覆盖布局容器的默认内边距。',
    },
    {
      name: 'isScrollable',
      type: 'boolean',
      description: '启用可滚动溢出。',
      default: 'true',
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
    {
      name: 'width',
      type: 'number | string',
      description:
        '面板宽度。数字按像素处理，字符串按原样使用。可调整大小的面板传入 useResizable(handleRef, options) 报告的尺寸（width={region.size}），并把 ref 交给相邻的 ResizeHandle。提供已弃用的 resizable 时忽略。',
    },
    {
      name: 'resizable',
      type: 'ResizableProps',
      description:
        "已弃用：来自 useResizable 配置对象形式的调整大小属性，面板宽度即 hook 的尺寸。其中携带区域的轴向（'horizontal' | 'vertical'），必须与相邻 ResizeHandle 的 direction 一致。请改为传入 useResizable(handleRef, options) 的 width={region.size}。将在下一个次版本中移除。",
    },
  ],
};

export const docsDense = {
  name: 'LayoutPanel',
  isHiddenFromOverview: true,
  displayName: 'Layout Panel',
  description: 'Sidebar for navigation, settings, inspector panels.',
  propDescriptions: {
    children: 'Panel content.',
    hasDivider: 'Border on appropriate edge.',
    padding:
      'Internal padding on spacing scale. Overrides layout container default.',
    isScrollable: 'Enable scrollable overflow.',
    label: 'Accessible label for landmark element.',
    role: 'ARIA landmark role.',
    width:
      'Panel width. Numbers = pixels, strings as-is. Resizable panel: width={region.size} from useResizable(handleRef, options). Ignored when deprecated resizable provided.',
    resizable:
      'Deprecated: config-object useResizable props. Use width={region.size} instead. Removed next minor.',
  },
};
