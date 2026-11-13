// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'ChatToolCalls',
  name: 'ChatToolCalls — Expandable',
  displayName: 'ChatToolCalls — Expandable',
  description: 'Tool calls with expandable result details showing diffs and command output in code blocks. Click a row to reveal its result.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['ChatToolCalls', 'CodeBlock'],
  fits: ['chat', 'inline'],
};
