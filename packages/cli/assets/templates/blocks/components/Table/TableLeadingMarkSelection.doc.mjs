// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTableSelectionState',
  alsoExampleFor: ['Table'],
  name: 'Table — Selection in the Leading Mark',
  displayName: 'Table — Selection in the Leading Mark',
  description:
    'Selection without a checkbox column: each item shows its avatar, and the checkbox takes the avatar slot while a mouse is over it, on keyboard focus, and everywhere once anything is selected; on touch screens it always shows. The state comes from useTableSelectionState, and the checkboxes render in the name column instead of the useTableSelection column, so checked items get no aria-selected or highlight; add them if needed.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Table', 'CheckboxInput', 'Avatar'],
};
