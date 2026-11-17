// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'useIcon',
  name: 'useIcon — Status Row',
  displayName: 'useIcon — Status Row',
  description:
    'A custom status row that draws the semantic success, warning and error icons with useIcon. The same row renders under the current theme and under a Theme whose icons override those three, and its icons change with no change to the component.',
  isReady: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['Theme', 'Layout', 'Text'],
  icons: {
    CheckBadgeIcon: 'success',
    ExclamationCircleIcon: 'warning',
    NoSymbolIcon: 'error',
  },
};
