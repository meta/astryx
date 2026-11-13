// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTableTreeData',
  alsoExampleFor: ['useTableTreeState'],
  alsoShowcaseFor: ['useTableTreeState'],
  name: 'useTableTreeData: Tree Table',
  displayName: 'useTableTreeData: Tree Table',
  description:
    'A file-tree table built from nested data. useTableTreeState flattens the tree into the visible rows and owns the expanded set; useTableTreeData draws the per-level indent and the expand/collapse chevron in the tree column. The two hooks are designed to work together, so this one example covers both. hasExpandAllControl adds the expand-all/collapse-all toggle to the tree column header. Collapsed branches are unmounted, not hidden.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Table'],
  fits: ['table', 'list'],
};
