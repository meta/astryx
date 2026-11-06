// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTableSelectionState',
  alsoExampleFor: ['Table'],
  name: 'Table — Selection in the Leading Mark',
  displayName: 'Table — Selection in the Leading Mark',
  description:
    'Row selection without a checkbox column: each row shows its avatar, and the checkbox takes the avatar slot while a mouse is over it, on keyboard focus, and on every row once anything is selected. The state comes from useTableSelectionState; the checkboxes are rendered in the name column instead of by useTableSelection.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Table', 'CheckboxInput', 'Avatar'],
};
