// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  name: 'With close button',
  displayName: 'With close button',
  description:
    'Pass onOpenChange to render a close button that calls it with false. Drawer renders no close button of its own, so this is the usual visible way to close.',
  exampleFor: 'DrawerHeader',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Drawer',
    'DrawerHeader',
    'Button',
    'Layout',
    'LayoutContent',
    'Text',
  ],
};
