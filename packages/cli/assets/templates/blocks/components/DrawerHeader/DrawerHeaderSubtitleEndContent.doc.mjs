// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  name: 'With subtitle and end content',
  displayName: 'With subtitle and end content',
  description:
    'Add a subtitle under the title and put a status, such as a Badge, in endContent. The close button stays at the end of the row.',
  exampleFor: 'DrawerHeader',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Drawer',
    'DrawerHeader',
    'Badge',
    'Button',
    'Layout',
    'LayoutContent',
    'Text',
  ],
};
