// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'CommandPaletteEmpty',
  subComponentOf: 'CommandPalette',
  displayName: 'Command Palette Empty',
  isHiddenFromOverview: true,
  description:
    'Empty state display for the results area. CommandPalette renders it automatically when a search returns no results, or when there is no query and bootstrap() returns nothing.',
  props: [
    {
      name: 'children',
      type: 'ReactNode',
      description: 'Message or content to display.',
      required: true,
    },
  ],
  playground: {
    defaults: {
      children: 'No results found. Try a different search.',
    },
  },
};

export const docsZh = {
  name: 'CommandPaletteEmpty',
  isHiddenFromOverview: true,
  displayName: 'Command Palette Empty',
  description:
    '结果区域的空状态展示。当搜索没有结果，或没有查询且 bootstrap() 未返回任何内容时，由 CommandPalette 自动渲染。',
  propDescriptions: {
    children: '要显示的消息或内容。',
  },
};

export const docsDense = {
  name: 'CommandPaletteEmpty',
  isHiddenFromOverview: true,
  displayName: 'Command Palette Empty',
  description:
    'empty state; auto-rendered by palette when a search has no results, or no query and bootstrap() returns nothing',
  propDescriptions: {
    children: 'message or content to display',
  },
};
