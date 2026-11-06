// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Unified diff from a patch',
  displayName: 'Unified diff from a patch',
  description:
    'A patch parsed with parseUnifiedDiff and rendered in unified or split view. Clicking a line number selects that line and opens an annotation row under it, the way a review comment would appear.',
  exampleFor: 'DiffViewer',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'DiffViewer',
    'Button',
    'HStack',
    'StackItem',
    'VStack',
    'Text',
  ],
};
