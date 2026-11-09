// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useTruncation',
  name: 'useTruncation — Truncated Table Cells',
  displayName: 'useTruncation — Truncated Table Cells',
  description:
    'A narrow Table column whose cells show a Tooltip with the full value only when useTruncation reports the text is cut off; short values and a roomy column stay tooltip-free, and one column clamps to two lines.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Table', 'Tooltip'],
};
