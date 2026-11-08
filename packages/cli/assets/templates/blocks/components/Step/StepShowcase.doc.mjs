// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Step',
  name: 'Step',
  displayName: 'Step',
  description:
    'A single Step, with every part it can render: the indicator, the label with its optional marker and trailing endContent, and the description beneath. A Step never sets its own completed/current state. It declares its index and derives the rest from the parent Stepper, so one Step in one Stepper is a complete example.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Stepper', 'Step', 'Text'],
};
