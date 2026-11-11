// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useMultiCombobox',
  name: 'useMultiCombobox — Issue Labels',
  displayName: 'useMultiCombobox — Issue Labels',
  description:
    'A Labels field built on useMultiCombobox: typing filters the labels, the arrow keys move the active option while focus stays in the field, Enter or a click toggles a label and the list stays open, and selected labels show as removable tokens above the field.',
  isReady: true,
  aspectRatio: 4 / 3,
  icons: {CheckIcon: 'check'},
  componentsUsed: [
    'MultiSelector',
    'Card',
    'TextInput',
    'Item',
    'Icon',
    'Token',
    'Layout',
  ],
};
