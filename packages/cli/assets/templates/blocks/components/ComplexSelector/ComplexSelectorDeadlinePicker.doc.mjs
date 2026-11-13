// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ComplexSelector',
  name: 'ComplexSelector — Deadline Picker',
  displayName: 'Complex Selector — Deadline Picker',
  description:
    'A multi-step deadline field: pick a preset like Today or Next week, or switch to a custom date and time before applying. The popup stays open until the user commits, so the content owns the Apply action.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'ComplexSelector',
    'RadioList',
    'DateInput',
    'TimeInput',
    'Button',
  ],
  fits: ['form'],
};
