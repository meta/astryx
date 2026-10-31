// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CommandPaletteItem',
  name: 'CommandPaletteItem',
  displayName: 'Command Palette Item',
  description:
    'An inline command palette whose items pair each command label with its keyboard shortcut through renderItem.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['CommandPalette', 'CommandPaletteItem', 'Kbd', 'Text'],
};
