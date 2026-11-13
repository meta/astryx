// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CodeBlock',
  name: 'Code — Highlighted',
  displayName: 'Code — Highlighted',
  description:
    'TypeScript code with specific lines highlighted to draw attention to a key section. Use highlightLines to call out new or important code in tutorials and changelogs.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['CodeBlock'],
  fits: ['content'],
};
