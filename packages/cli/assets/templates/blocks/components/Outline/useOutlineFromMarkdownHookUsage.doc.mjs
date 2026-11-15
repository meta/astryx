// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useOutlineFromMarkdown',
  name: 'useOutlineFromMarkdown — Docs Article',
  displayName: 'useOutlineFromMarkdown — Docs Article',
  description:
    'A docs-style article with an Outline next to it, built from the same Markdown string through useOutlineFromMarkdown. "Add section" appends a heading to the string, and a new entry that links to it appears in the outline.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Markdown', 'Outline', 'ScrollableArea', 'Button', 'Layout'],
};
