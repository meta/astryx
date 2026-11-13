// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CommandPaletteInput',
  name: 'CommandPaletteInput',
  displayName: 'Command Palette Input',
  description:
    'Command palette search input with a custom placeholder and a keyboard shortcut hint in the endContent slot.',
  isReady: true,
  isShowcase: true,
  aspectRatio: 4 / 3,
  componentsUsed: ['CommandPalette', 'CommandPaletteInput', 'Kbd'],
  fits: ['overlay'],
};
