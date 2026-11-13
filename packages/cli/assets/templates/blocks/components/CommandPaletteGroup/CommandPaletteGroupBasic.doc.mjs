// Copyright (c) Meta Platforms, Inc. and affiliates.

/** @type {import('@astryxdesign/cli/authoring').TemplateDoc} */
export const doc = {
  type: 'block',
  exampleFor: 'CommandPaletteGroup',
  name: 'CommandPaletteGroup — Basic',
  displayName: 'CommandPaletteGroup — Basic',
  description:
    'Command palette items organized under group headings using the composed CommandPaletteGroup form. Use to separate related commands into labeled sections.',
  isReady: true,
  aspectRatio: 16 / 9,
  componentsUsed: [
    'CommandPaletteGroup',
    'CommandPaletteItem',
    'CommandPaletteList',
  ],
  fits: ['overlay'],
};
