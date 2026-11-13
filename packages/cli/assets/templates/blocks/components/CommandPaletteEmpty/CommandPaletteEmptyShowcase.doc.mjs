// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CommandPaletteEmpty',
  name: 'CommandPaletteEmpty',
  displayName: 'Command Palette Empty',
  description:
    'Command palette empty state shown when no commands are available.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['CommandPalette', 'CommandPaletteEmpty', 'Text'],
  fits: ['overlay', 'feedback'],
};
