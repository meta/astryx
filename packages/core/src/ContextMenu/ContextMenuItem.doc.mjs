// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'ContextMenuItem',
  subComponentOf: 'ContextMenu',
  displayName: 'Context Menu Item',
  isHiddenFromOverview: true,
  description: 'Menu item component for compound mode. Re-exported from DropdownMenuItem for discoverability.',
  props: [
    {
      name: 'icon',
      type: 'ReactNode | IconType',
      description: 'Icon to display before the label; pass a semantic icon name such as \'search\' (see `astryx docs icons`), an icon component, or an icon element.',
    },
    {
      name: 'label',
      type: 'ReactNode',
      description: 'Primary label text.',
    },
    {
      name: 'description',
      type: 'ReactNode',
      description: 'Secondary description text displayed below the label.',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description: 'Additional content rendered after the label and description.',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: 'StyleX styles for layout customization.',
    },
  ],
  playground: {
    defaults: {
      label: 'Edit',
      description: 'Modify this item',
    },
  },
};

export const docsZh = {
  name: 'ContextMenuItem',
  isHiddenFromOverview: true,
  displayName: 'Context Menu Item',
  description: '复合模式的菜单项组件。从 DropdownMenuItem 重新导出以便发现。',
  props: [
    {
      name: 'icon',
      type: 'ReactNode | IconType',
      description: '显示在标签前的图标；可传语义图标名称（如 \'search\'，见 `astryx docs icons`）、图标组件或图标元素。',
    },
    {
      name: 'label',
      type: 'ReactNode',
      description: '主标签文本。',
    },
    {
      name: 'description',
      type: 'ReactNode',
      description: '显示在标签下方的次要描述文本。',
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description: '在标签和描述之后渲染的附加内容。',
    },
    {
      name: 'xstyle',
      type: 'StyleXStyles',
      description: '根容器的 StyleX 样式。',
    },
  ],
};

export const docsDense = {
  name: 'ContextMenuItem',
  isHiddenFromOverview: true,
  displayName: 'Context Menu Item',
  description: 're-exported DropdownMenuItem for compound mode',
  propDescriptions: {
    icon: 'icon before label; semantic icon name string OK, e.g. \'search\' (`astryx docs icons`), or icon component/element.',
    label: 'primary label text',
    description: 'secondary text below label',
    endContent: 'additional content after label+description',
    xstyle: 'StyleX styles for root container',
  },
};
