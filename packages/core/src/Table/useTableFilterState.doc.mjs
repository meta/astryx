// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableFilterState',
  subComponentOf: 'Table',
  displayName: 'useTableFilterState',
  isHiddenFromOverview: true,
  description: 'Managed state hook for table filtering. Returns the current filter map and an onChange handler. Pass the result directly to useTableFiltering.',
  props: [
    {
      name: 'initialState',
      type: 'TableFilterState',
      description: 'Optional initial filter state map.',
    },
  ],
};

export const docsZh = {
  name: 'useTableFilterState',
  isHiddenFromOverview: true,
  displayName: 'useTableFilterState',
  description: '表格筛选的受管状态 hook。返回当前筛选映射和 onChange 处理程序。将结果直接传递给 useTableFiltering。',
  props: [
    {
      name: 'initialState',
      type: 'TableFilterState',
      description: '可选的初始筛选状态映射。',
    },
  ],
};

export const docsDense = {
  name: 'useTableFilterState',
  isHiddenFromOverview: true,
  displayName: 'useTableFilterState',
  description: 'Managed filter state hook. Returns filter map + onChange handler for useTableFiltering.',
  propDescriptions: {
    initialState: 'Optional initial filter state map.',
  },
};
