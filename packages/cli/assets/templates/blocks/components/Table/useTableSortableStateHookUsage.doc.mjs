// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTableSortableState',
  name: 'useTableSortableState — Multi-Sort Orders',
  displayName: 'useTableSortableState — Multi-Sort Orders',
  description:
    'Orders with no sort code of their own: useTableSortableState owns the sort state, returns the sorted orders, and hands useTableSortable a ready config. Click Customer, then Shift-click Total, to sort by customer and then by total within each customer. A line above the orders reads the current sort state from the hook.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Table', 'Layout', 'Text'],
};
