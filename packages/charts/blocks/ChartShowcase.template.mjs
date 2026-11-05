// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Chart',
  displayName: 'Chart',
  description: 'A responsive monthly revenue bar chart.',
  exampleFor: 'Chart',
  aspectRatio: 16 / 10,
  isShowcase: true,
  alsoShowcaseFor: ['ChartBar'],
  componentsUsed: ['Chart', 'ChartAxis', 'ChartGrid'],
};
