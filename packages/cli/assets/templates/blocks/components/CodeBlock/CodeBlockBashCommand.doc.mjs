// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CodeBlock',
  name: 'Code — Snippet',
  displayName: 'Code — Snippet',
  description:
    'Short terminal commands with no header: the copy button sits in its own column beside the code, so a one-line command reads as a single row and a long line ends before the button instead of running under it. Use for install instructions or one-liner commands that readers will paste directly.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['CodeBlock', 'Stack'],
};
