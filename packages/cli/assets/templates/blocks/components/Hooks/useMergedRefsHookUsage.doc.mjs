// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useMergedRefs',
  name: 'useMergedRefs — AutoGrowTextArea',
  displayName: 'useMergedRefs — AutoGrowTextArea',
  description:
    "An AutoGrowTextArea that forwards the caller's ref and also keeps its own ref to measure scrollHeight. The merged ref attaches both to the same textarea: it resizes itself while a parent button focuses it through the forwarded ref.",
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Card', 'Button', 'Layout'],
};
