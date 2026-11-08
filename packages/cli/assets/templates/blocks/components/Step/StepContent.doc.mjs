// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Step',
  name: 'Step — Content Slot',
  displayName: 'Step — Content Slot',
  description:
    'Children passed to a Step render below its description, indented to line up with the label rather than the indicator, and stay outside the clickable label area so buttons inside remain their own targets. In a full flow you gate the slot on the step being active. That is what turns a vertical stepper into an expanding one.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Stepper', 'Step', 'TextInput', 'Button'],
};
