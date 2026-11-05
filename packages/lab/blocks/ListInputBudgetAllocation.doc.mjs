// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Budget allocation',
  displayName: 'Budget allocation',
  description:
    'Mixed control types in one record: a team Selector in a proportional column beside a percentage NumberInput in a fixed 132px column. Each team can appear once (a record error), the rows must total 100% (a list error), and Add stops at four teams.',
  exampleFor: 'ListInput',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['ListInput', 'Selector', 'NumberInput', 'VStack'],
};
