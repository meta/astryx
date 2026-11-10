// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  name: 'Width budget: pixels or any CSS length',
  displayName: 'Width budget: pixels or any CSS length',
  description:
    'Compare a numeric pixel width with rem and percentage lengths. The width budget also caps the drawer on mobile.',
  exampleFor: 'Drawer',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Drawer',
    'Button',
    'Layout',
    'LayoutContent',
    'HStack',
    'DrawerHeader',
    'Text',
  ],
};
