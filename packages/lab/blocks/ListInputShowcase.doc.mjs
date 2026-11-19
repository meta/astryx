// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Tag options',
  displayName: 'Tag options',
  description:
    'A reorderable tag editor. Each record pairs a color Selector with a label TextInput; drag a grip or use the keyboard to reorder. Validation sits at the narrowest useful level: an empty label after blur is a field error, a disallowed color and label pair is a record error, and fewer than five tags is a list error.',
  exampleFor: 'ListInput',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['ListInput', 'Selector', 'TextInput', 'VStack'],
};
