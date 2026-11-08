// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Selector',
  name: 'Selector — Option descriptions',
  displayName: 'Selector — Option descriptions',
  description:
    'Options carry a description, so the dropdown draws a two-line row. The closed trigger is sized by padding, so it is the size token for a one-line value and exactly one line taller for a two-line one; both on the 4px rhythm. An InputGroup pins the row, so the value folds back onto one line there.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Selector',
    'SelectorOption',
    'InputGroup',
    'Button',
    'Stack',
  ],
  icons: {GlobeAltIcon: 'globe', LockClosedIcon: 'lock'},
};
