// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTableSelection',
  name: 'Table: Bulk Actions',
  displayName: 'Table: Bulk Actions',
  description:
    'Controlled row selection with the reusable TableSelectionToolbar rendered in flow above the table. Product actions occupy the logical start; synchronized selection count and complete clear action occupy the logical end.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Table', 'TableSelectionToolbar', 'Button'],
};
