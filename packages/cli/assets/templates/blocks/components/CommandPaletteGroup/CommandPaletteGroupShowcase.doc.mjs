// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CommandPaletteGroup',
  name: 'CommandPaletteGroup',
  displayName: 'Command Palette Group',
  description: 'Command palette groups in both data-driven (auxiliaryData.group) and composed (CommandPaletteGroup + CommandPaletteItem) forms.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['CommandPalette', 'CommandPaletteGroup', 'CommandPaletteItem', 'CommandPaletteList', 'Layout', 'Text'],
  fits: ['overlay'],
};
