// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CodeBlock',
  name: 'Code — Terminal',
  displayName: 'Code — Terminal',
  description:
    'A dark terminal-style command block: a bash CodeBlock wrapped in SyntaxTheme with the GitHub Dark preset, copy button on, and no line numbers. Use for shell sessions or CLI output that should read as a terminal even on light pages. Reach for a dark syntax preset instead of hand-rolling a dark box with custom CSS.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['CodeBlock', 'SyntaxTheme'],
  fits: ['content'],
};
