// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Margin comment',
  displayName: 'Margin comment',
  description:
    'One comment thread in a Card beside a document: it quotes its passage, opens on a press into its replies and reply composer, and resolves.',
  exampleFor: 'CommentThread',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['CommentThread', 'Card'],
};
