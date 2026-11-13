// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'Table',
  alsoExampleFor: ['useTableFiltering', 'useTableFilterState'],
  name: 'Table — Inline Filters',
  displayName: 'Table — Inline Filters',
  description:
    'Table with inline filter controls rendered directly below each column header.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Table', 'PowerSearch'],
  fits: ['table'],
};
