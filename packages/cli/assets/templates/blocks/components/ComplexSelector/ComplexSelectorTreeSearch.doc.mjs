// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ComplexSelector',
  name: 'ComplexSelector — Tree Search',
  displayName: 'Complex Selector — Tree Search',
  description:
    'A destination picker that combines a search field with a TreeList hierarchy. TreeList owns tree keyboard navigation; ComplexSelector owns the trigger, popover, and focus restore. Selecting a folder closes the popup.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['ComplexSelector', 'TextInput', 'TreeList'],
  fits: ['form'],
};
