// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Stepper',
  name: 'Stepper — On-Track Vertical',
  displayName: 'Stepper — On-Track Vertical',
  description:
    'The on-track layout in vertical orientation: indicators sit inline on a continuous connector rail, with each label and description beside its node. Compare with the separated layout, where the indicator sits alongside its own bar segment instead of on a shared rail.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Stepper', 'Step'],
  fits: ['navigation', 'panel'],
};
