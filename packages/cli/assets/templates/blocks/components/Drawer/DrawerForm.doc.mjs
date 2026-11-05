// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  name: 'Edit form with footer actions',
  displayName: 'Edit form with footer actions',
  description:
    'Compose a Layout with DrawerHeader, the fields in LayoutContent, and Cancel and Save in a pinned LayoutFooter. purpose="form" keeps Escape but ignores scrim clicks, so a stray click outside does not discard edits.',
  exampleFor: 'Drawer',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'Drawer',
    'DrawerHeader',
    'Button',
    'Layout',
    'LayoutContent',
    'LayoutFooter',
    'HStack',
    'VStack',
    'TextInput',
  ],
};
