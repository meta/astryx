// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Pagination',
  name: 'Pagination — With Table',
  displayName: 'Pagination — With Table',
  description:
    'Pagination below a data table with client-side page slicing. Use the count variant with small size for dense data views where users need to see item ranges.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Pagination', 'Table', 'Layout'],
  fits: ['table', 'footer'],
};
