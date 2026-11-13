// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CommandPaletteList',
  name: 'CommandPaletteList',
  displayName: 'Command Palette List',
  description:
    'Scrollable command palette list with grouped items, including a highlighted item, composed without a full CommandPalette.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['CommandPaletteList', 'CommandPaletteGroup', 'CommandPaletteItem'],
  fits: ['overlay', 'list'],
};
