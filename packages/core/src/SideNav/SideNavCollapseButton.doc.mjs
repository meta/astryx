// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'SideNavCollapseButton',
  subComponentOf: 'SideNav',
  displayName: 'Side Nav Collapse Button',
  isHiddenFromOverview: true,
  description: 'Toggle button for sidenav collapse. Place inside SideNav (reads context automatically) or outside it (hand the same controlled collapsible config to both). Renders as an icon-only ghost button by default.',
  playground: {
    defaults: {
      collapsible: {
        isCollapsed: false,
        onCollapsedChange: undefined,
      },
    },
  },
  props: [
    {
      name: 'collapsible',
      type: '{isCollapsed: boolean, onCollapsedChange: (isCollapsed: boolean) => void}',
      description: 'The same controlled collapsible config passed to SideNav. Only needed when the button is rendered outside the sidenav, where collapse context cannot reach it.',
    },
    {
      name: 'handleRef',
      type: 'RefObject<SideNavImperativeCollapseHandle | null>',
      description: 'Deprecated. Imperative collapse handle from SideNav; pass collapsible instead.',
    },
    {
      name: 'label',
      type: 'string',
      description: 'Custom button label. When provided, renders as a text button with chevron. When omitted, renders icon-only.',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: "Button size. Defaults to the size its container cascades ('sm' inside a SideNav footer) and to 'md' with no container. Set it when the button sits outside a sized container and has to match its neighbours.",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Custom button content. Overrides the default chevron icon and label.',
    },
  ],
};

export const docsZh = {
  name: 'SideNavCollapseButton',
  isHiddenFromOverview: true,
  displayName: 'Side Nav Collapse Button',
  description: '侧边栏折叠切换按钮。放置在 SideNav 内部（自动读取上下文）或外部（向两者传入同一个受控 collapsible 配置）。默认渲染为仅图标的 ghost 按钮。',
  props: [
    {
      name: 'collapsible',
      type: '{isCollapsed: boolean, onCollapsedChange: (isCollapsed: boolean) => void}',
      description: '与 SideNav 相同的受控 collapsible 配置。仅在按钮渲染在侧边栏外部、无法读取折叠上下文时需要。',
    },
    {
      name: 'handleRef',
      type: 'RefObject<SideNavImperativeCollapseHandle | null>',
      description: '已废弃。来自 SideNav 的命令式折叠句柄；请改用 collapsible。',
    },
    {
      name: 'label',
      type: 'string',
      description: '自定义按钮标签。提供时渲染为带箭头的文本按钮。省略时渲染为仅图标按钮。',
    },
    {
      name: 'size',
      type: "'sm' | 'md' | 'lg'",
      description: "按钮尺寸。默认使用容器级联的尺寸（SideNav 页脚内为 'sm'），无容器时为 'md'。当按钮位于已设定尺寸的容器之外且需要与相邻元素保持一致时显式设置。",
    },
    {
      name: 'children',
      type: 'ReactNode',
      description: '自定义按钮内容。覆盖默认的箭头图标和标签。',
    },
  ],
};

export const docsDense = {
  name: 'SideNavCollapseButton',
  isHiddenFromOverview: true,
  displayName: 'Side Nav Collapse Button',
  description: 'Toggle button for sidenav collapse. Place inside SideNav (reads context) or outside (pass the same controlled collapsible config both get). Icon-only ghost button by default.',
  propDescriptions: {
    collapsible: 'Controlled collapsible config, same object SideNav gets. Only needed when button rendered outside sidenav.',
    handleRef: 'Deprecated. Pass collapsible instead.',
    label: 'Custom label. Text button w/ chevron when provided, icon-only when omitted.',
    size: "Button size. Inherits from the container ('sm' in a SideNav footer), else 'md'.",
    children: 'Custom content. Overrides default chevron icon + label.',
  },
};
