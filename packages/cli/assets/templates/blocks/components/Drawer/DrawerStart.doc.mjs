// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  name: 'Slide in from the start edge',
  displayName: 'Slide in from the start edge',
  description:
    'Set side="start" to open from the inline start edge: left in LTR and right in RTL. The default end edge follows the inspector convention.',
  exampleFor: 'Drawer',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Drawer',
    'Button',
    'Layout',
    'LayoutContent',
    'DrawerHeader',
    'Text',
  ],
};
