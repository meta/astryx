// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useOutlineFromDOM',
  name: 'useOutlineFromDOM — Docs Article',
  displayName: 'useOutlineFromDOM — Docs Article',
  description:
    'An article with an Outline built from its DOM headings through useOutlineFromDOM. "Add heading" renders a new heading, and the MutationObserver inside the hook puts it in the outline without extra wiring.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Outline', 'ScrollableArea', 'Button', 'Layout', 'Text'],
};
