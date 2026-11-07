// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useDirection',
  name: 'useDirection — Canvas Axis From the Start Edge',
  displayName: 'useDirection — Canvas Axis From the Start Edge',
  description:
    'A sparkline whose time axis must run from the start edge: canvas geometry cannot use CSS logical properties, so the component reads the direction during render with useDirection and puts the newest point on the correct side. Switching the provider between English and Arabic flips the chart.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: [
    'InternationalizationProvider',
    'SegmentedControl',
    'Layout',
  ],
};
