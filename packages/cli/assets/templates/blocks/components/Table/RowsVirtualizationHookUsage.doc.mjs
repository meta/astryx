// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTableRowsVirtualization',
  name: 'useTableRowsVirtualization - Fixed Height Rows',
  displayName: 'useTableRowsVirtualization - Fixed Height Rows',
  description:
    "A Table with 1,000 product rows inside a 320px-tall parent, which bounds its scroll area. Give the Table's parent a height, fixed or relative, or a flex child, so windowing can bound the rows; with no height every row renders. Scroll vertically to mount the visible rows. The caller keeps all data and columns; this hook does not virtualize columns.",
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['Table', 'VStack'],
};
