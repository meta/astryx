// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTableSelection',
  name: 'Table: Floating Bulk Actions',
  displayName: 'Table: Floating Bulk Actions',
  description:
    'The reusable TableSelectionToolbar inside a capped, self-contained scroll region for a long non-sticky table below metric cards. The caller-owned sticky placement keeps actions 16px from the example scrollport without moving the table when selection changes.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Table',
    'TableSelectionToolbar',
    'Button',
    'ScrollableArea',
  ],
};
