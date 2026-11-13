// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'BottomSheet',
  name: 'Bottom Sheet — No scrim',
  displayName: 'Bottom Sheet — No scrim',
  description:
    'Keeps the page visible and interactive behind a non-modal bottom sheet.',
  isReady: true,
  aspectRatio: 3 / 4,
  componentsUsed: [
    'BottomSheet',
    'Button',
    'Divider',
    'Heading',
    'Section',
    'Stack',
    'Text',
  ],
  fits: ['overlay', 'content'],
};
