// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Chart - Trend Comparison',
  displayName: 'Chart - Trend Comparison',
  description:
    'Compares actual values with a planned trend on one shared chart scale.',
  exampleFor: 'Chart',
  aspectRatio: 16 / 10,
  isShowcase: false,
  componentsUsed: ['Chart', 'ChartAxis', 'ChartGrid'],
};
