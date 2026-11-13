// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Pagination',
  name: 'Pagination — Page Size Selector',
  displayName: 'Pagination — Page Size Selector',
  description:
    'A transactions table with pagination and a page size dropdown at the bottom. Shows how pagination works as a footer below real content, with adjustable rows per page.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Pagination', 'Text', 'Layout', 'Table'],
  fits: ['table', 'footer'],
};
