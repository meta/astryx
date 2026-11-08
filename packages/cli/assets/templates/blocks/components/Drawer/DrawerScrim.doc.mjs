// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  name: 'Modal or non-modal (hasScrim)',
  displayName: 'Modal or non-modal (hasScrim)',
  description:
    'The default modal drawer dims the page, traps focus, and closes on a scrim click. With hasScrim={false}, the drawer has no scrim or focus trap and leaves the page interactive.',
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
