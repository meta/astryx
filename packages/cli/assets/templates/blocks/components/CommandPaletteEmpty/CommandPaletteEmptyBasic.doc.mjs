// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CommandPaletteEmpty',
  name: 'CommandPaletteEmpty — Basic',
  displayName: 'CommandPaletteEmpty — Basic',
  description:
    'A command palette with no results, showing a custom empty message via emptyBootstrapText. Use to explain why the palette is empty and what the user can do next.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['CommandPalette', 'CommandPaletteEmpty', 'Text'],
  fits: ['overlay', 'feedback'],
};
