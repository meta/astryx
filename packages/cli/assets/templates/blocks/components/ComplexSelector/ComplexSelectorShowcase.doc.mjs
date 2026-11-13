// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ComplexSelector',
  name: 'ComplexSelector',
  displayName: 'Complex Selector',
  description:
    'A two-axis picker: choose a fruit and a ripeness level from one control. ComplexSelector owns the trigger, popover, and focus restore while the custom grid owns its keyboard semantics.',
  isReady: true,
  aspectRatio: 1,
  isShowcase: true,
  componentsUsed: ['ComplexSelector', 'Text'],
  fits: ['form'],
};
