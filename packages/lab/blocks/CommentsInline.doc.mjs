// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export default {
  type: 'block',
  name: 'Inline comments',
  displayName: 'Inline comments',
  description:
    'A realistic Markdown document review with highlighted passages synchronized to a Comments side panel. Selecting an unannotated passage starts a quoted thread; replies and resolution update host-owned data.',
  exampleFor: 'Comments',
  isReady: true,
  aspectRatio: 3 / 2,
  componentsUsed: ['Button', 'Card', 'Comments', 'HStack', 'Text', 'VStack'],
};
