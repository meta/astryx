// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CommandPaletteItem',
  name: 'CommandPaletteItem — Basic',
  displayName: 'CommandPaletteItem — Basic',
  description:
    'Selectable command palette items inside a CommandPaletteList, including highlighted and disabled states. Use when composing a palette manually instead of a search source.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['CommandPaletteItem', 'CommandPaletteList'],
  fits: ['overlay'],
};
