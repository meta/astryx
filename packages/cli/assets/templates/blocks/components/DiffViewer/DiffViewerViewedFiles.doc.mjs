// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'DiffViewer',
  name: 'DiffViewer — Viewed files',
  displayName: 'Diff Viewer — Viewed files',
  description:
    'The file list of a review page: one DiffViewer per file in a patch, each with a "Viewed" checkbox in headerEnd. Checking it folds the file through a controlled collapsible, and the file header still opens and closes the file on its own.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['DiffViewer', 'CheckboxInput', 'VStack'],
};
