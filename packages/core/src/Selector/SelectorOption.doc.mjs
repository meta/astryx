// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'SelectorOption',
  subComponentOf: 'Selector',
  displayName: 'Selector Option',
  isHiddenFromOverview: true,
  description:
    'Helper component for custom item rendering inside an Selector renderOption prop.',
  props: [
    {
      name: 'label',
      type: 'ReactNode',
      description: 'Primary label text for the item.',
      required: true,
    },
    {
      name: 'icon',
      type: 'ReactNode | IconType',
      description:
        'Icon displayed before the label; pass a semantic icon name such as \'search\' (see `astryx docs icons`), an icon component, or an icon element.',
    },
    {
      name: 'description',
      type: 'ReactNode',
      description: 'Secondary description text displayed below the label.',
    },
    {
      name: 'layout',
      type: "'stacked' | 'inline'",
      description:
        "How the label and description sit together. 'stacked' puts the description on its own line; 'inline' keeps both on one line so the row fits a fixed-height host. Inside a Selector trigger the trigger's padding sizes itself to whichever layout you pick, so both land on the 4px rhythm; an InputGroup pins the row height and forces 'inline'.",
      default: "'stacked'",
    },
    {
      name: 'endContent',
      type: 'ReactNode',
      description:
        'Additional content rendered after the label and description.',
    },
  ],
};

export const docsZh = {
  name: 'SelectorOption',
  isHiddenFromOverview: true,
  displayName: 'Selector Option',
  description:
    '用于在 Selector 的 renderOption 渲染函数中自定义选项渲染的辅助组件。',
  props: [
    {
      name: 'label',
      type: 'ReactNode',
      description: '选项的主标签文本。',
      required: true,
    },
    {
      name: 'icon',
      type: 'ReactNode | IconType',
      description: '显示在标签前的图标；可传语义图标名称（如 \'search\'，见 `astryx docs icons`）、图标组件或图标元素。',
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
  ],
};

export const docsDense = {
  name: 'SelectorOption',
  isHiddenFromOverview: true,
  displayName: 'Selector Option',
  description:
    'Helper component for custom item rendering inside Selector renderOption prop.',
  propDescriptions: {
    label: 'Primary label text for item.',
    icon: 'Icon displayed before label; semantic icon name string OK, e.g. \'search\' (`astryx docs icons`), or icon component/element.',
    description: 'Secondary description text below label.',
    endContent: 'Additional content after label+description.',
  },
};
