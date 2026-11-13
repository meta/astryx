// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CodeBlock',
  name: 'Code — Scrollable',
  displayName: 'Code — Scrollable',
  description:
    'A long code block with a max height that enables vertical scrolling. Use maxHeight to keep the block from dominating the page when displaying large files.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['CodeBlock'],
  fits: ['content'],
};
