// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CommandPaletteFooter',
  name: 'CommandPaletteFooter — Basic',
  displayName: 'CommandPaletteFooter — Basic',
  description:
    'A command palette footer with no children, rendering the built-in keyboard navigation hints. Use CommandPaletteFooter without content to get the default arrow-key, Enter, and Esc hints below the results list.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: ['CommandPalette', 'CommandPaletteFooter'],
  fits: ['overlay'],
};
