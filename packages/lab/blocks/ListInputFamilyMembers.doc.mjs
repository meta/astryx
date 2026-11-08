// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Family member declaration',
  displayName: 'Family member declaration',
  description:
    'Three simple fields per record, the recommended ceiling: a full legal name, a relationship Selector, and a DateInput in a fixed 176px column. Order is immaterial, so the list is not reorderable. At 640px or narrower each record stacks its fields with repeated labels.',
  exampleFor: 'ListInput',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['ListInput', 'TextInput', 'Selector', 'DateInput', 'VStack'],
};
