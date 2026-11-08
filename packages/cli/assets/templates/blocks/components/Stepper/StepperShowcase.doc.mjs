// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Stepper',
  name: 'Stepper — Checkout Progress',
  displayName: 'Stepper — Checkout Progress',
  description:
    'The default stepper: a horizontal track where every step owns an equal segment of the progress bar above its label. The default auto indicator resolves itself per step: a check once the step is done, a ring on the current step, a number for the ones still ahead. Click any step to jump.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Stepper'],
};
