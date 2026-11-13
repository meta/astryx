// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Code',
  name: 'Code',
  displayName: 'Code',
  description:
    'Inline code snippets inside a sentence showing how Code renders alongside body text.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Code', 'Layout', 'Text'],
  fits: ['inline', 'content'],
};
