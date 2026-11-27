// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').ComponentDoc} */

export const docs = {
  name: 'useTableFilterState',
  subComponentOf: 'Table',
  displayName: 'useTableFilterState',
  isHiddenFromOverview: true,
  description:
    'Managed state hook for table filtering. Returns filters (the current filter map), onFilterChange, and clearAll (clears every filter, for example from a "Clear filters" button in the Table emptyState). Pass filters and onFilterChange to useTableFiltering.',
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
  description:
    '表格筛选的受管状态 hook。返回 filters（当前筛选映射）、onFilterChange 和 clearAll（清除所有筛选，例如 Table emptyState 中的“清除筛选”按钮）。将 filters 和 onFilterChange 传给 useTableFiltering。',
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
  description:
    'Managed filter state hook. Returns {filters, onFilterChange, clearAll}; pass filters + onFilterChange to useTableFiltering; clearAll resets every filter.',
  propDescriptions: {
    initialState: 'Optional initial filter state map.',
  },
};
